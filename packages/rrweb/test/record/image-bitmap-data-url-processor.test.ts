import type {
  DataURLOptions,
  ImageBitmapDataURLWorkerParams,
  ImageBitmapDataURLWorkerResponse,
} from '@rrweb/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInlineImageBitmapProcessor,
  createWorkerImageBitmapProcessor,
  createWorkerMessageHandler,
  type ImageBitmapDataURLProcessor,
} from '../../src';

type FakeBitmap = ImageBitmap & {
  payload: string;
  pixel: [number, number, number, number];
  failDraw?: boolean;
};

class FakeOffscreenCanvas {
  static contextAvailable = true;
  static failConvert = false;

  private payload: string;
  private pixel: [number, number, number, number] = [0, 0, 0, 0];

  constructor(public width: number, public height: number) {
    this.payload = `transparent:${width}x${height}`;
  }

  getContext() {
    if (!FakeOffscreenCanvas.contextAvailable) return null;
    return {
      drawImage: (bitmap: FakeBitmap) => {
        if (bitmap.failDraw) throw new Error('synthetic draw failure');
        this.payload = bitmap.payload;
        this.pixel = bitmap.pixel;
      },
      getImageData: () => ({ data: new Uint8ClampedArray(this.pixel) }),
    };
  }

  async convertToBlob(options: DataURLOptions = {}) {
    if (FakeOffscreenCanvas.failConvert) {
      throw new Error('synthetic convert failure');
    }
    const type = options.type ?? 'image/png';
    const quality = options.quality ?? 'default';
    return new Blob(
      [`${this.payload}|${this.width}x${this.height}|${type}|${quality}`],
      { type },
    );
  }
}

function fakeBitmap(
  payload: string,
  pixel: [number, number, number, number] = [255, 0, 0, 255],
  failDraw = false,
) {
  return {
    payload,
    pixel,
    failDraw,
    close: vi.fn(),
  } as unknown as FakeBitmap;
}

function params(
  id: number,
  bitmap: FakeBitmap,
  options: {
    width?: number;
    height?: number;
    dataURLOptions?: DataURLOptions;
  } = {},
): ImageBitmapDataURLWorkerParams {
  return {
    id,
    bitmap,
    width: options.width ?? 1,
    height: options.height ?? 1,
    dataURLOptions: options.dataURLOptions ?? {},
  };
}

function expectedResponse(
  id: number,
  payload: string,
  width: number,
  height: number,
  type: string,
  quality: number | 'default',
): ImageBitmapDataURLWorkerResponse {
  return {
    id,
    type,
    base64: Buffer.from(
      `${payload}|${width}x${height}|${type}|${quality}`,
    ).toString('base64'),
    width,
    height,
  };
}

type WorkerListener = (event: MessageEvent<unknown>) => void;

class FakeWorker {
  readonly messages: Array<{
    message: ImageBitmapDataURLWorkerParams;
    transfer: Transferable[];
  }> = [];
  readonly listeners = new Map<string, Set<WorkerListener>>();
  readonly terminate = vi.fn();
  postError?: Error;

  postMessage(
    message: ImageBitmapDataURLWorkerParams,
    transfer: Transferable[],
  ) {
    if (this.postError) throw this.postError;
    this.messages.push({ message, transfer });
  }

  addEventListener(type: string, listener: WorkerListener) {
    const listeners = this.listeners.get(type) ?? new Set<WorkerListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: WorkerListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: unknown) {
    const event = { data } as MessageEvent<unknown>;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeOffscreenCanvas.contextAvailable = true;
  FakeOffscreenCanvas.failConvert = false;
});

describe('ImageBitmap data URL processors', () => {
  it('suppresses transparent and identical frames but emits dimension, MIME, and quality changes', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const processor = createInlineImageBitmapProcessor();

    const transparent = fakeBitmap('transparent:1x1', [0, 0, 0, 0]);
    await expect(processor(params(7, transparent))).resolves.toEqual({ id: 7 });
    expect(transparent.close).toHaveBeenCalledTimes(1);

    const red = fakeBitmap('red');
    await expect(processor(params(7, red))).resolves.toEqual(
      expectedResponse(7, 'red', 1, 1, 'image/png', 'default'),
    );
    expect(red.close).toHaveBeenCalledTimes(1);

    const unchanged = fakeBitmap('red');
    await expect(processor(params(7, unchanged))).resolves.toEqual({ id: 7 });
    expect(unchanged.close).toHaveBeenCalledTimes(1);

    const resized = fakeBitmap('red');
    await expect(
      processor(params(7, resized, { width: 2, height: 3 })),
    ).resolves.toEqual(
      expectedResponse(7, 'red', 2, 3, 'image/png', 'default'),
    );
    expect(resized.close).toHaveBeenCalledTimes(1);

    const jpeg = fakeBitmap('red');
    await expect(
      processor(
        params(7, jpeg, {
          width: 2,
          height: 3,
          dataURLOptions: { type: 'image/jpeg', quality: 0.5 },
        }),
      ),
    ).resolves.toEqual(expectedResponse(7, 'red', 2, 3, 'image/jpeg', 0.5));
    expect(jpeg.close).toHaveBeenCalledTimes(1);
  });

  it('closes the bitmap and emits no frame when OffscreenCanvas or its 2D context is unavailable', async () => {
    const missingCanvasBitmap = fakeBitmap('red');
    const missingCanvasProcessor = createInlineImageBitmapProcessor();
    await expect(
      missingCanvasProcessor(params(1, missingCanvasBitmap)),
    ).resolves.toEqual({ id: 1 });
    expect(missingCanvasBitmap.close).toHaveBeenCalledTimes(1);

    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    FakeOffscreenCanvas.contextAvailable = false;
    const missingContextBitmap = fakeBitmap('red');
    await expect(
      createInlineImageBitmapProcessor()(params(2, missingContextBitmap)),
    ).resolves.toEqual({ id: 2 });
    expect(missingContextBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('closes the bitmap exactly once and emits no frame after draw or conversion errors', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const drawFailure = fakeBitmap('red', [255, 0, 0, 255], true);
    await expect(
      createInlineImageBitmapProcessor()(params(3, drawFailure)),
    ).resolves.toEqual({ id: 3 });
    expect(drawFailure.close).toHaveBeenCalledTimes(1);

    FakeOffscreenCanvas.failConvert = true;
    const convertFailure = fakeBitmap('red');
    await expect(
      createInlineImageBitmapProcessor()(params(4, convertFailure)),
    ).resolves.toEqual({ id: 4 });
    expect(convertFailure.close).toHaveBeenCalledTimes(1);
  });

  it('transfers a bitmap to the worker and resolves the matching result', async () => {
    const worker = new FakeWorker();
    const processor = createWorkerImageBitmapProcessor(
      worker as unknown as Worker,
    );
    const bitmap = fakeBitmap('worker-red');
    const pending = processor(params(11, bitmap));

    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]).toEqual({
      message: params(11, bitmap),
      transfer: [bitmap],
    });
    const response = expectedResponse(
      11,
      'worker-red',
      1,
      1,
      'image/png',
      'default',
    );
    worker.emit('message', response);
    await expect(pending).resolves.toEqual(response);
  });

  it('falls back inline after a synchronous worker post failure', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const worker = new FakeWorker();
    worker.postError = new Error('synthetic CSP rejection');
    const processor = createWorkerImageBitmapProcessor(
      worker as unknown as Worker,
      { onError: () => undefined },
    );
    const bitmap = fakeBitmap('fallback-red');

    await expect(processor(params(12, bitmap))).resolves.toEqual(
      expectedResponse(12, 'fallback-red', 1, 1, 'image/png', 'default'),
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'messageerror'])(
    'settles transferred work and uses inline fallback after worker %s',
    async (eventType) => {
      vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
      const worker = new FakeWorker();
      const processor = createWorkerImageBitmapProcessor(
        worker as unknown as Worker,
        { onError: () => undefined },
      );
      const pending = processor(params(20, fakeBitmap('transferred')));

      worker.emit(eventType, new Error(`synthetic ${eventType}`));
      await expect(pending).resolves.toEqual({ id: 20 });
      expect(worker.terminate).toHaveBeenCalledTimes(1);

      const fallbackBitmap = fakeBitmap('fallback-after-event');
      await expect(processor(params(21, fallbackBitmap))).resolves.toEqual(
        expectedResponse(
          21,
          'fallback-after-event',
          1,
          1,
          'image/png',
          'default',
        ),
      );
      expect(fallbackBitmap.close).toHaveBeenCalledTimes(1);
    },
  );

  it('times out a silent worker, disposes resources, and ignores late replies', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const processor = createWorkerImageBitmapProcessor(
      worker as unknown as Worker,
      { timeoutMs: 25, onError: () => undefined },
    );
    const pending = processor(params(13, fakeBitmap('silent')));

    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toEqual({ id: 13 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.listeners.get('message')?.size ?? 0).toBe(0);
    worker.emit(
      'message',
      expectedResponse(13, 'late', 1, 1, 'image/png', 'default'),
    );
    await expect(pending).resolves.toEqual({ id: 13 });

    const afterTimeout = fakeBitmap('after-timeout');
    await expect(processor(params(14, afterTimeout))).resolves.toEqual({
      id: 14,
    });
    expect(afterTimeout.close).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work on dispose and closes calls made after disposal', async () => {
    const worker = new FakeWorker();
    const processor = createWorkerImageBitmapProcessor(
      worker as unknown as Worker,
    );
    const pending = processor(params(15, fakeBitmap('pending')));

    processor.dispose?.();
    await expect(pending).resolves.toEqual({ id: 15 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.listeners.get('message')?.size ?? 0).toBe(0);

    const afterDispose = fakeBitmap('after-dispose');
    await expect(processor(params(16, afterDispose))).resolves.toEqual({
      id: 16,
    });
    expect(afterDispose.close).toHaveBeenCalledTimes(1);
  });

  it('worker message handler emits converted results and contains conversion failures', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const messages: ImageBitmapDataURLWorkerResponse[] = [];
    const handler = createWorkerMessageHandler((message) =>
      messages.push(message),
    );
    const bitmap = fakeBitmap('handler-red');
    await handler({ data: params(17, bitmap) } as MessageEvent);
    expect(messages).toEqual([
      expectedResponse(17, 'handler-red', 1, 1, 'image/png', 'default'),
    ]);
    expect(bitmap.close).toHaveBeenCalledTimes(1);

    const drawFailure = fakeBitmap('handler-failure', [0, 0, 0, 255], true);
    await handler({ data: params(18, drawFailure) } as MessageEvent);
    expect(messages.at(-1)).toEqual({ id: 18 });
    expect(drawFailure.close).toHaveBeenCalledTimes(1);
  });

  it('exposes the processor type as a callable with optional lifecycle cleanup', () => {
    const processor: ImageBitmapDataURLProcessor = Object.assign(
      async ({ id }: ImageBitmapDataURLWorkerParams) => ({ id }),
      { dispose: () => undefined },
    );
    expect(typeof processor).toBe('function');
    expect(typeof processor.dispose).toBe('function');
  });
});
