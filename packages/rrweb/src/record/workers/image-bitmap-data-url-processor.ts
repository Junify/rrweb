import { encode } from 'base64-arraybuffer';
import type {
  DataURLOptions,
  ImageBitmapDataURLWorkerParams,
  ImageBitmapDataURLWorkerResponse,
} from '@rrweb/types';
import type { ImageBitmapDataURLProcessor } from '../../types';
import type { ImageBitmapDataURLRequestWorker } from './image-bitmap-data-url-worker';

const closeBitmap = (bitmap: ImageBitmap): void => {
  try {
    bitmap.close();
  } catch {
    // A transferred or already-closed bitmap needs no further cleanup.
  }
};

const encodeBlob = async (blob: Blob): Promise<string> =>
  encode(await blob.arrayBuffer());

const transparentCacheKey = (
  width: number,
  height: number,
  options: DataURLOptions,
): string =>
  `${width}:${height}:${options.type ?? 'image/png'}:${
    options.quality ?? 'default'
  }`;

export const createInlineImageBitmapProcessor =
  (): ImageBitmapDataURLProcessor => {
    const lastFrameByCanvas = new Map<number, string>();
    const transparentFrameByFormat = new Map<string, Promise<string | null>>();
    let disposed = false;

    const getTransparentFrame = (
      width: number,
      height: number,
      options: DataURLOptions,
    ): Promise<string | null> => {
      const key = transparentCacheKey(width, height, options);
      const cached = transparentFrameByFormat.get(key);
      if (cached) return cached;
      const frame = (async () => {
        // eslint-disable-next-line compat/compat -- runtime support is checked before this helper runs
        const canvas = new OffscreenCanvas(width, height);
        if (!canvas.getContext('2d')) return null;
        return encodeBlob(await canvas.convertToBlob(options));
      })().catch(() => null);
      transparentFrameByFormat.set(key, frame);
      return frame;
    };

    const processor: ImageBitmapDataURLProcessor = async ({
      id,
      bitmap,
      width,
      height,
      dataURLOptions,
    }) => {
      try {
        if (disposed || typeof globalThis.OffscreenCanvas === 'undefined') {
          return { id };
        }

        const transparentFrame = getTransparentFrame(
          width,
          height,
          dataURLOptions,
        );
        // eslint-disable-next-line compat/compat -- guarded by the OffscreenCanvas check above
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) return { id };

        context.drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob(dataURLOptions);
        const base64 = await encodeBlob(blob);
        if (disposed) return { id };

        const signature = `${width}:${height}:${blob.type}:${base64}`;
        if (!lastFrameByCanvas.has(id) && (await transparentFrame) === base64) {
          lastFrameByCanvas.set(id, signature);
          return { id };
        }
        if (lastFrameByCanvas.get(id) === signature) return { id };

        lastFrameByCanvas.set(id, signature);
        return { id, type: blob.type, base64, width, height };
      } catch {
        return { id };
      } finally {
        closeBitmap(bitmap);
      }
    };

    processor.dispose = () => {
      disposed = true;
      lastFrameByCanvas.clear();
      transparentFrameByFormat.clear();
    };
    return processor;
  };

type PendingWorkerRequest = {
  id: number;
  resolve: (response: ImageBitmapDataURLWorkerResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type WorkerImageBitmapProcessorOptions = {
  fallbackProcessor?: ImageBitmapDataURLProcessor;
  onError?: (error: unknown) => void;
  timeoutMs?: number;
};

const defaultOnWorkerError = (error: unknown): void => {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      '[rrweb] canvas worker failed; using inline processing',
      error,
    );
  }
};

export const createWorkerImageBitmapProcessor = (
  worker: ImageBitmapDataURLRequestWorker,
  options: WorkerImageBitmapProcessorOptions = {},
): ImageBitmapDataURLProcessor => {
  const fallbackProcessor =
    options.fallbackProcessor ?? createInlineImageBitmapProcessor();
  const onError = options.onError ?? defaultOnWorkerError;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const pending = new Map<number, PendingWorkerRequest[]>();
  let workerFailed = false;
  let disposed = false;
  let workerCleanedUp = false;

  const settleAllWithoutFrame = (): void => {
    pending.forEach((queue) => {
      queue.forEach((request) => {
        clearTimeout(request.timeout);
        request.resolve({ id: request.id });
      });
    });
    pending.clear();
  };

  function handleMessage(
    event: MessageEvent<ImageBitmapDataURLWorkerResponse>,
  ): void {
    if (workerFailed || disposed) return;
    const queue = pending.get(event.data.id);
    const request = queue?.shift();
    if (!request) return;
    clearTimeout(request.timeout);
    request.resolve(event.data);
    if (queue?.length === 0) pending.delete(event.data.id);
  }

  function handleMessageError(event: MessageEvent<unknown>): void {
    failWorker(event);
  }

  function handleWorkerError(event: ErrorEvent): void {
    failWorker(event);
  }

  const removeWorkerListeners = (): void => {
    if (workerCleanedUp) return;
    workerCleanedUp = true;
    if (worker.removeEventListener) {
      worker.removeEventListener('message', handleMessage as EventListener);
      worker.removeEventListener(
        'messageerror',
        handleMessageError as EventListener,
      );
      worker.removeEventListener('error', handleWorkerError as EventListener);
    } else {
      worker.onmessage = null;
      worker.onmessageerror = null;
      worker.onerror = null;
    }
    worker.terminate?.();
  };

  function failWorker(error: unknown): void {
    if (workerFailed || disposed) return;
    workerFailed = true;
    settleAllWithoutFrame();
    removeWorkerListeners();
    try {
      onError(error);
    } catch {
      // Error observers must not interrupt worker failure cleanup.
    }
  }

  if (worker.addEventListener) {
    worker.addEventListener('message', handleMessage as EventListener);
    worker.addEventListener(
      'messageerror',
      handleMessageError as EventListener,
    );
    worker.addEventListener('error', handleWorkerError as EventListener);
  } else {
    worker.onmessage = handleMessage;
    worker.onmessageerror = handleMessageError;
    worker.onerror = handleWorkerError;
  }

  const processor: ImageBitmapDataURLProcessor = (params) => {
    if (disposed) {
      closeBitmap(params.bitmap);
      return Promise.resolve({ id: params.id });
    }
    if (workerFailed) return fallbackProcessor(params);

    return new Promise<ImageBitmapDataURLWorkerResponse>((resolve) => {
      const request: PendingWorkerRequest = {
        id: params.id,
        resolve,
        timeout: setTimeout(
          () => failWorker(new Error('Canvas worker response timed out')),
          timeoutMs,
        ),
      };
      const queue = pending.get(params.id);
      if (queue) queue.push(request);
      else pending.set(params.id, [request]);

      try {
        worker.postMessage(params, [params.bitmap]);
      } catch (error) {
        clearTimeout(request.timeout);
        const currentQueue = pending.get(params.id);
        const requestIndex = currentQueue?.indexOf(request) ?? -1;
        if (requestIndex >= 0) currentQueue?.splice(requestIndex, 1);
        if (currentQueue?.length === 0) pending.delete(params.id);
        failWorker(error);
        fallbackProcessor(params).then(resolve, () =>
          resolve({ id: params.id }),
        );
      }
    });
  };

  processor.dispose = () => {
    if (disposed) return;
    disposed = true;
    settleAllWithoutFrame();
    removeWorkerListeners();
    fallbackProcessor.dispose?.();
  };
  return processor;
};

export type ImageBitmapWorkerMessageHandler = ((
  event: MessageEvent<ImageBitmapDataURLWorkerParams>,
) => Promise<void>) & { dispose?: () => void };

export const createWorkerMessageHandler = (
  postMessage: (message: ImageBitmapDataURLWorkerResponse) => void,
): ImageBitmapWorkerMessageHandler => {
  const processor = createInlineImageBitmapProcessor();
  const handler: ImageBitmapWorkerMessageHandler = async (event) => {
    postMessage(await processor(event.data));
  };
  handler.dispose = () => processor.dispose?.();
  return handler;
};
