import type { ICanvas, Mirror } from 'rrweb-snapshot';
import type {
  blockClass,
  canvasManagerMutationCallback,
  canvasMutationCallback,
  canvasMutationCommand,
  canvasMutationWithType,
  IWindow,
  listenerHandler,
  CanvasArg,
  DataURLOptions,
} from '@rrweb/types';
import { isBlocked } from '../../../utils';
import { CanvasContext } from '@rrweb/types';
import initCanvas2DMutationObserver from './2d';
import initCanvasContextObserver from './canvas';
import initCanvasWebGLMutationObserver from './webgl';

import { encode } from 'base64-arraybuffer';

export type RafStamps = { latestId: number; invokeId: number | null };

type pendingCanvasMutationsMap = Map<
  HTMLCanvasElement,
  canvasMutationWithType[]
>;

/**
 * Cache management for canvas still images (base64)
 *  - key: rrweb id of the canvas element
 *  - value: previously sent base64 (do not resend if transparent or identical image)
 */
const lastBlobMap: Map<number, string> = new Map();

/**
 * Cache for transparent images
 *  - key: "width-height"
 *  - value: base64 of a fully transparent image of that size
 */
const transparentBlobMap: Map<string, string> = new Map();

/**
 * Get a transparent image (base64) of the specified size
 *  - Returns an empty string if OffscreenCanvas cannot be used
 */
async function getTransparentBlobBase64(
  width: number,
  height: number,
  dataURLOptions: DataURLOptions,
): Promise<string> {
  const id = `${width}-${height}`;
  if (transparentBlobMap.has(id)) {
    return transparentBlobMap.get(id)!;
  }
  if ('OffscreenCanvas' in window) {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    // Draw nothing → fully transparent
    if (!ctx) {
      return '';
    }
    const blob = await offscreen.convertToBlob(dataURLOptions);
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = encode(arrayBuffer);
    transparentBlobMap.set(id, base64);
    return base64;
  }
  return '';
}

/**
 * Encode the canvas on the main thread and return base64
 *  - If OffscreenCanvas is available, encode off‑screen
 *  - Otherwise, use .toDataURL()
 */
async function getCanvasBase64(
  canvas: HTMLCanvasElement,
  dataURLOptions: DataURLOptions,
): Promise<string> {
  if ('OffscreenCanvas' in window) {
    // Path using OffscreenCanvas + convertToBlob
    const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      return '';
    }
    ctx.drawImage(canvas, 0, 0);
    const blob = await offscreen.convertToBlob(dataURLOptions);
    const arrayBuffer = await blob.arrayBuffer();
    return encode(arrayBuffer);
  } else {
    // fallback: convert directly to base64 with <canvas>.toDataURL()
    // The dataURLOptions.quality option is only applicable for image/jpeg, image/webp, etc.
    // You can pass the quality as the second argument, but be careful when type/quality are not specified.
    let type = dataURLOptions?.type || 'image/png';
    let quality = dataURLOptions?.quality;
    if (quality === undefined) {
      // The second argument of toDataURL can be omitted
      return canvas.toDataURL(type).split(',')[1]; // "data:image/xxx;base64,..." → extract only the base64 part
    } else {
      return canvas.toDataURL(type, quality).split(',')[1];
    }
  }
}

export class CanvasManager {
  private pendingCanvasMutations: pendingCanvasMutationsMap = new Map();
  private rafStamps: RafStamps = { latestId: 0, invokeId: null };
  private mirror: Mirror;

  private mutationCb: canvasMutationCallback;
  private resetObservers?: listenerHandler;
  private frozen = false;
  private locked = false;

  public reset() {
    this.pendingCanvasMutations.clear();
    this.resetObservers && this.resetObservers();
  }

  public freeze() {
    this.frozen = true;
  }

  public unfreeze() {
    this.frozen = false;
  }

  public lock() {
    this.locked = true;
  }

  public unlock() {
    this.locked = false;
  }

  constructor(options: {
    recordCanvas: boolean;
    mutationCb: canvasMutationCallback;
    win: IWindow;
    blockClass: blockClass;
    blockSelector: string | null;
    mirror: Mirror;
    sampling?: 'all' | number;
    dataURLOptions: DataURLOptions;
  }) {
    const {
      sampling = 'all',
      win,
      blockClass,
      blockSelector,
      recordCanvas,
      dataURLOptions,
    } = options;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;

    if (recordCanvas && sampling === 'all') {
      this.initCanvasMutationObserver(win, blockClass, blockSelector);
    }
    if (recordCanvas && typeof sampling === 'number') {
      this.initCanvasFPSObserver(sampling, win, blockClass, blockSelector, {
        dataURLOptions,
      });
    }
  }

  private processMutation: canvasManagerMutationCallback = (
    target,
    mutation,
  ) => {
    const newFrame =
      this.rafStamps.invokeId &&
      this.rafStamps.latestId !== this.rafStamps.invokeId;
    if (newFrame || !this.rafStamps.invokeId) {
      this.rafStamps.invokeId = this.rafStamps.latestId;
    }

    if (!this.pendingCanvasMutations.has(target)) {
      this.pendingCanvasMutations.set(target, []);
    }

    this.pendingCanvasMutations.get(target)!.push(mutation);
  };

  /**
   * Change points:
   * - Removed the part that created a Worker and switched to using OffscreenCanvas / toDataURL on the main thread
   * - Transparency check and diff check are now performed within the main thread
   */
  private initCanvasFPSObserver(
    fps: number,
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
    options: {
      dataURLOptions: DataURLOptions;
    },
  ) {
    const canvasContextReset = initCanvasContextObserver(
      win,
      blockClass,
      blockSelector,
      true,
    );

    const timeBetweenSnapshots = 1000 / fps;
    let lastSnapshotTime = 0;
    let rafId: number;

    // Prevent multiple concurrent canvas encodings (in‑progress flag)
    const snapshotInProgressMap: Map<number, boolean> = new Map();

    // Get canvases in the specified document
    const getCanvas = (): HTMLCanvasElement[] => {
      const matchedCanvas: HTMLCanvasElement[] = [];
      win.document.querySelectorAll('canvas').forEach((canvas) => {
        if (!isBlocked(canvas, blockClass, blockSelector, true)) {
          matchedCanvas.push(canvas);
        }
      });
      return matchedCanvas;
    };

    const takeCanvasSnapshots = async (timestamp: DOMHighResTimeStamp) => {
      if (
        lastSnapshotTime &&
        timestamp - lastSnapshotTime < timeBetweenSnapshots
      ) {
        rafId = requestAnimationFrame(takeCanvasSnapshots);
        return;
      }
      lastSnapshotTime = timestamp;

      const canvases = getCanvas();
      for (const canvas of canvases) {
        const id = this.mirror.getId(canvas);
        if (snapshotInProgressMap.get(id)) {
          continue;
        }
        // Skip if width/height is 0 to avoid errors
        if (canvas.width === 0 || canvas.height === 0) {
          continue;
        }

        snapshotInProgressMap.set(id, true);

        // Hack to force redraw when WebGL canvas has preserveDrawingBuffer=false
        if (['webgl', 'webgl2'].includes((canvas as ICanvas).__context)) {
          const context = canvas.getContext((canvas as ICanvas).__context) as
            | WebGLRenderingContext
            | WebGL2RenderingContext
            | null;
          if (
            context?.getContextAttributes()?.preserveDrawingBuffer === false
          ) {
            // Clear to reload contents (may make it transparent)
            context.clear(context.COLOR_BUFFER_BIT);
          }
        }

        // --- Obtain base64 on the main thread ---
        let base64: string = '';
        try {
          base64 = await getCanvasBase64(canvas, options.dataURLOptions);
        } catch (e) {
          console.error('failed to get base64 for the canvas');
          // Leave as empty string on failure
        }

        const base64Len = base64.length;
        const estimatedBytes = Math.floor((base64Len * 3) / 4);
        console.log(
          `[rrweb-canvas] id=${id}, new snapshot: base64 length=${base64Len}, approx bytes=${estimatedBytes}`,
        );

        snapshotInProgressMap.set(id, false);

        if (!base64) {
          // Encoding failed or unsupported
          continue;
        }

        // Only on the first time, check whether it is the same as a transparent image
        if (!lastBlobMap.has(id)) {
          // Generate a transparent image and compare
          const transparentBase64 = await getTransparentBlobBase64(
            canvas.width,
            canvas.height,
            options.dataURLOptions,
          );
          if (transparentBase64 === base64) {
            // If transparent, treat as "no update"
            lastBlobMap.set(id, base64);
            continue;
          }
        }

        // Check if same image as last time
        if (lastBlobMap.get(id) === base64) {
          // No change
          continue;
        }

        // New image detected, send event
        lastBlobMap.set(id, base64);

        // Call canvasMutationCallback in line with rrweb's original implementation
        // Whether 2D or WebGL, the final rendering sends the same 'drawImage' command
        const { type: blobType = 'image/png' } = options.dataURLOptions;

        // Format expected by rrweb (drawImage call + base64 Blob)
        this.mutationCb({
          id,
          type: CanvasContext['2D'],
          commands: [
            {
              property: 'clearRect', // wipe canvas
              args: [0, 0, canvas.width, canvas.height],
            },
            {
              property: 'drawImage', // draws (semi-transparent) image
              args: [
                {
                  rr_type: 'ImageBitmap',
                  args: [
                    {
                      rr_type: 'Blob',
                      data: [{ rr_type: 'ArrayBuffer', base64 }],
                      type: blobType,
                    },
                  ],
                } as CanvasArg,
                0,
                0,
              ],
            },
          ],
        });
      }

      rafId = requestAnimationFrame(takeCanvasSnapshots);
    };

    rafId = requestAnimationFrame(takeCanvasSnapshots);

    this.resetObservers = () => {
      canvasContextReset();
      cancelAnimationFrame(rafId);
    };
  }

  private initCanvasMutationObserver(
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
  ): void {
    this.startRAFTimestamping();
    this.startPendingCanvasMutationFlusher();

    const canvasContextReset = initCanvasContextObserver(
      win,
      blockClass,
      blockSelector,
      false,
    );
    const canvas2DReset = initCanvas2DMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
    );

    const canvasWebGL1and2Reset = initCanvasWebGLMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
    );

    this.resetObservers = () => {
      canvasContextReset();
      canvas2DReset();
      canvasWebGL1and2Reset();
    };
  }

  private startPendingCanvasMutationFlusher() {
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  private startRAFTimestamping() {
    const setLatestRAFTimestamp = (timestamp: DOMHighResTimeStamp) => {
      this.rafStamps.latestId = timestamp;
      requestAnimationFrame(setLatestRAFTimestamp);
    };
    requestAnimationFrame(setLatestRAFTimestamp);
  }

  flushPendingCanvasMutations() {
    this.pendingCanvasMutations.forEach(
      (_values: canvasMutationCommand[], canvas: HTMLCanvasElement) => {
        const id = this.mirror.getId(canvas);
        this.flushPendingCanvasMutationFor(canvas, id);
      },
    );
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  flushPendingCanvasMutationFor(canvas: HTMLCanvasElement, id: number) {
    if (this.frozen || this.locked) {
      return;
    }

    const valuesWithType = this.pendingCanvasMutations.get(canvas);
    if (!valuesWithType || id === -1) return;

    const values = valuesWithType.map((value) => {
      const { type, ...rest } = value;
      return rest;
    });
    const { type } = valuesWithType[0];

    this.mutationCb({ id, type, commands: values });

    this.pendingCanvasMutations.delete(canvas);
  }
}
