import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { vi } from 'vitest';
import type { recordOptions } from '../../src/types';
import {
  listenerHandler,
  eventWithTime,
  EventType,
  IncrementalSource,
  CanvasContext,
  type ImageBitmapDataURLWorkerParams,
  type ImageBitmapDataURLWorkerResponse,
} from '@rrweb/types';
import {
  assertSnapshot,
  launchPuppeteer,
  stripBase64,
  waitForRAF,
} from '../utils';
import type { ICanvas } from 'rrweb-snapshot';

interface ISuite {
  code: string;
  browser: puppeteer.Browser;
  page: puppeteer.Page;
  events: eventWithTime[];
}

interface IWindow extends Window {
  rrweb: {
    record: (
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined;
    addCustomEvent<T>(tag: string, payload: T): void;
  };
  emit: (e: eventWithTime) => undefined;
}

const setup = function (
  this: ISuite,
  content: string,
  canvasSample: 'all' | number = 'all',
): ISuite {
  const ctx = {} as ISuite;

  beforeAll(async () => {
    ctx.browser = await launchPuppeteer();
  });

  beforeEach(async () => {
    ctx.page = await ctx.browser.newPage();
    await ctx.page.goto('about:blank');
    await ctx.page.setContent(content);
    await ctx.page.addScriptTag({
      path: path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
    });
    ctx.events = [];
    await ctx.page.exposeFunction('emit', (e: eventWithTime) => {
      if (e.type === EventType.DomContentLoaded || e.type === EventType.Load) {
        return;
      }
      ctx.events.push(e);
    });

    ctx.page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    await ctx.page.evaluate((canvasSample) => {
      const { record } = (window as unknown as IWindow).rrweb;
      record({
        recordCanvas: true,
        sampling: {
          canvas: canvasSample,
        },
        emit: (window as unknown as IWindow).emit,
      });
    }, canvasSample);
  });

  afterEach(async () => {
    await ctx.page.close();
  });

  afterAll(async () => {
    await ctx.browser.close();
  });

  return ctx;
};

describe('record webgl', function (this: ISuite) {
  vi.setConfig({ testTimeout: 100_000 });

  const ctx: ISuite = setup.call(
    this,
    `
      <!DOCTYPE html>
      <html>
        <body>
          <canvas id="canvas"></canvas>
        </body>
      </html>
    `,
  );

  it('will record changes to a canvas element', async () => {
    await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      var gl = canvas.getContext('webgl')!;

      gl.clear(gl.COLOR_BUFFER_BIT);
    });

    await ctx.page.waitForTimeout(50);

    const lastEvent = ctx.events[ctx.events.length - 1];
    expect(lastEvent).toMatchObject({
      data: {
        source: IncrementalSource.CanvasMutation,
        type: CanvasContext.WebGL,
        commands: [
          {
            args: [16384],
            property: 'clear',
          },
        ],
      },
    });
    await assertSnapshot(ctx.events);
  });

  it('will record changes to a webgl2 canvas element', async () => {
    await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      var gl = canvas.getContext('webgl2')!;

      gl.clear(gl.COLOR_BUFFER_BIT);
    });

    await ctx.page.waitForTimeout(50);

    const lastEvent = ctx.events[ctx.events.length - 1];
    expect(lastEvent).toMatchObject({
      data: {
        source: IncrementalSource.CanvasMutation,
        type: CanvasContext.WebGL2,
        commands: [
          {
            args: [16384],
            property: 'clear',
          },
        ],
      },
    });
    await assertSnapshot(ctx.events);
  });

  it('will record changes to a canvas element before the canvas gets added', async () => {
    await ctx.page.evaluate(() => {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl')!;
      var program = gl.createProgram()!;
      gl.linkProgram(program);
      gl.clear(gl.COLOR_BUFFER_BIT);
      document.body.appendChild(canvas);
    });

    await waitForRAF(ctx.page);

    await assertSnapshot(ctx.events);
  });

  it('will record changes to a canvas element before the canvas gets added (webgl2)', async () => {
    await ctx.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        var canvas = document.createElement('canvas');
        var gl = canvas.getContext('webgl2')!;
        var program = gl.createProgram()!;
        gl.linkProgram(program);
        gl.clear(gl.COLOR_BUFFER_BIT);
        setTimeout(() => {
          document.body.appendChild(canvas);
          resolve();
        }, 10);
      });
    });

    // FIXME: this wait deeply couples the test to the implementation
    // When `pendingCanvasMutations` isn't run on requestAnimationFrame,
    // we need to change this
    await waitForRAF(ctx.page);

    await assertSnapshot(ctx.events);
  });

  it('will record webgl variables', async () => {
    await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      var gl = canvas.getContext('webgl')!;
      var program0 = gl.createProgram()!;
      gl.linkProgram(program0);
      var program1 = gl.createProgram()!;
      gl.linkProgram(program1);
    });

    await ctx.page.waitForTimeout(50);

    await assertSnapshot(ctx.events);
  });

  it('will record webgl variables in reverse order', async () => {
    await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      var gl = canvas.getContext('webgl')!;
      var program0 = gl.createProgram()!;
      var program1 = gl.createProgram()!;
      // attach them in reverse order
      gl.linkProgram(program1);
      gl.linkProgram(program0);
    });

    await ctx.page.waitForTimeout(50);

    await assertSnapshot(ctx.events);
  });

  it('sets _context on canvas.getContext()', async () => {
    const context = await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      canvas.getContext('webgl')!;
      return (canvas as ICanvas).__context;
    });

    expect(context).toBe('webgl');
  });

  it('only sets _context on first canvas.getContext() call', async () => {
    const context = await ctx.page.evaluate(() => {
      var canvas = document.getElementById('canvas') as HTMLCanvasElement;
      canvas.getContext('webgl');
      canvas.getContext('2d'); // returns null
      return (canvas as ICanvas).__context;
    });

    expect(context).toBe('webgl');
  });

  it('should batch events by RAF', async () => {
    await ctx.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const gl = canvas.getContext('webgl') as WebGLRenderingContext;
        const program = gl.createProgram()!;
        gl.linkProgram(program);
        requestAnimationFrame(() => {
          const program2 = gl.createProgram()!;
          gl.linkProgram(program2);
          gl.clear(gl.COLOR_BUFFER_BIT);
          requestAnimationFrame(() => {
            gl.clear(gl.COLOR_BUFFER_BIT);
            resolve();
          });
        });
      });
    });

    await ctx.page.waitForTimeout(50);

    await assertSnapshot(ctx.events);
    expect(ctx.events.length).toEqual(5);
  });

  describe('recordCanvas FPS', function (this: ISuite) {
    vi.setConfig({ testTimeout: 10_000 });

    const maxFPS = 60;

    const ctx: ISuite = setup.call(
      this,
      `
      <!DOCTYPE html>
      <html>
        <body>
          <canvas id="canvas"></canvas>
        </body>
      </html>
    `,
      maxFPS,
    );

    it('should record snapshots', async () => {
      await ctx.page.evaluate(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })!;
        // Set the clear color to darkish green.
        gl.clearColor(0.0, 0.5, 0.0, 1.0);
        // Clear the context with the newly set color. This is
        // the function call that actually does the drawing.
        gl.clear(gl.COLOR_BUFFER_BIT);
      });

      await ctx.page.waitForTimeout(200); // give it some time buffer

      await ctx.page.evaluate(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })!;
        // Set the clear color to darkish blue.
        gl.clearColor(0.0, 0.0, 0.5, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });

      await ctx.page.waitForTimeout(200);

      await waitForRAF(ctx.page);

      // should yield a frame for each change at a max of 60fps
      await assertSnapshot(stripBase64(ctx.events));
    });
  });
});

describe('recordCanvas FPS processor integration', () => {
  vi.setConfig({ testTimeout: 100_000 });

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  let events: eventWithTime[];

  beforeAll(async () => {
    browser = await launchPuppeteer();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><html><body><canvas id="canvas" width="2" height="2"></canvas></body></html>',
    );
    await page.addScriptTag({
      path: path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
    });
    events = [];
    await page.exposeFunction('emitCanvasEvent', (event: eventWithTime) => {
      events.push(event);
    });
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('uses an injected processor for numeric FPS sampling', async () => {
    const injectedBase64 = 'SlVOSUZZX0lOSkVDVEVEX0NBTlZBU19GUkFNRQ==';
    await page.evaluate((base64) => {
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
        injectedProcessorCalls: number;
        stopCanvasRecording?: listenerHandler;
      };
      pageWindow.injectedProcessorCalls = 0;
      pageWindow.stopCanvasRecording = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordCanvas: true,
        sampling: { canvas: 60 },
        imageBitmapProcessor: async ({ id, bitmap, width, height }) => {
          pageWindow.injectedProcessorCalls += 1;
          bitmap.close();
          return { id, type: 'image/png', base64, width, height };
        },
      });
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 2, 2);
    }, injectedBase64);

    await page.waitForFunction(
      () =>
        (window as typeof window & { injectedProcessorCalls?: number })
          .injectedProcessorCalls! > 0,
    );
    await page.waitForTimeout(50);
    const processorCalls = await page.evaluate(
      () =>
        (window as typeof window & { injectedProcessorCalls: number })
          .injectedProcessorCalls,
    );
    await page.evaluate(() => {
      (
        window as typeof window & { stopCanvasRecording?: listenerHandler }
      ).stopCanvasRecording?.();
    });

    expect(processorCalls).toBeGreaterThan(0);
    expect(
      events.some(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          event.data.source === IncrementalSource.CanvasMutation &&
          JSON.stringify(event).includes(injectedBase64),
      ),
    ).toBe(true);
  });

  it('does not emit a late injected processor result after stop', async () => {
    const lateBase64 = 'SlVOSUZZX0xBVEVfQ0FOVkFTX0ZSQU1F';
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
        injectedProcessorCalls: number;
        resolveCanvasProcessor?: () => void;
        stopCanvasRecording?: listenerHandler;
      };
      pageWindow.injectedProcessorCalls = 0;
      pageWindow.stopCanvasRecording = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordCanvas: true,
        sampling: { canvas: 60 },
        imageBitmapProcessor: ({ id, bitmap, width, height }) => {
          pageWindow.injectedProcessorCalls += 1;
          bitmap.close();
          return new Promise((resolve) => {
            pageWindow.resolveCanvasProcessor = () =>
              resolve({
                id,
                type: 'image/png',
                base64: 'SlVOSUZZX0xBVEVfQ0FOVkFTX0ZSQU1F',
                width,
                height,
              });
          });
        },
      });
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
    });
    await page.waitForFunction(
      () =>
        (window as typeof window & { injectedProcessorCalls?: number })
          .injectedProcessorCalls! > 0,
    );
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        stopCanvasRecording?: listenerHandler;
        resolveCanvasProcessor?: () => void;
      };
      pageWindow.stopCanvasRecording?.();
      pageWindow.resolveCanvasProcessor?.();
    });
    await page.waitForTimeout(50);

    expect(JSON.stringify(events)).not.toContain(lateBase64);
  });

  it('continues numeric FPS capture with inline processing when CSP blocks the worker', async () => {
    await page.evaluate(() => {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = "worker-src 'none'";
      document.head.appendChild(meta);
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
        stopCanvasRecording?: listenerHandler;
      };
      pageWindow.stopCanvasRecording = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordCanvas: true,
        sampling: { canvas: 60 },
      });
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#0000ff';
      context.fillRect(0, 0, 2, 2);
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      (
        window as typeof window & { stopCanvasRecording?: listenerHandler }
      ).stopCanvasRecording?.();
    });

    expect(
      events.some(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          event.data.source === IncrementalSource.CanvasMutation,
      ),
    ).toBe(true);
  });

  it('disposes an injected processor on stop even when DOM recording is disabled', async () => {
    const disposeCalls = await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
        processorDisposeCalls: number;
      };
      pageWindow.processorDisposeCalls = 0;
      const processor = Object.assign(
        async ({ id, bitmap }: { id: number; bitmap: ImageBitmap }) => {
          bitmap.close();
          return { id };
        },
        {
          dispose: () => {
            pageWindow.processorDisposeCalls += 1;
          },
        },
      );
      const stop = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordDOM: false,
        recordCanvas: true,
        sampling: { canvas: 60 },
        imageBitmapProcessor: processor,
      });
      stop?.();
      stop?.();
      return pageWindow.processorDisposeCalls;
    });

    expect(disposeCalls).toBe(1);
  });

  it('contains an injected disposer failure and completes idempotent stop cleanup', async () => {
    const lateBase64 = 'SlVOSUZZX1RIUk9XSU5HX0RJU1BPU0VfTEFURQ==';
    await page.evaluate(() => {
      type RecordFunction = ((
        options: recordOptions<eventWithTime>,
      ) => listenerHandler | undefined) & {
        addCustomEvent<T>(tag: string, payload: T): void;
      };
      const pageWindow = window as typeof window & {
        rrweb: { record: RecordFunction };
        emitCanvasEvent: (event: eventWithTime) => void;
        throwingDisposeCalls: number;
        throwingProcessorCalls: number;
        resolveThrowingProcessor?: () => void;
        stopThrowingRecording?: listenerHandler;
      };
      pageWindow.throwingDisposeCalls = 0;
      pageWindow.throwingProcessorCalls = 0;
      const processor = Object.assign(
        ({ id, bitmap, width, height }: ImageBitmapDataURLWorkerParams) => {
          pageWindow.throwingProcessorCalls += 1;
          bitmap.close();
          return new Promise<ImageBitmapDataURLWorkerResponse>((resolve) => {
            pageWindow.resolveThrowingProcessor = () =>
              resolve({
                id,
                type: 'image/png',
                base64: 'SlVOSUZZX1RIUk9XSU5HX0RJU1BPU0VfTEFURQ==',
                width,
                height,
              });
          });
        },
        {
          dispose: () => {
            pageWindow.throwingDisposeCalls += 1;
            throw new Error('synthetic dispose failure');
          },
        },
      );
      pageWindow.stopThrowingRecording = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordDOM: false,
        recordCanvas: true,
        sampling: { canvas: 60 },
        imageBitmapProcessor: processor,
      });
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
    });
    await page.waitForFunction(
      () =>
        (window as typeof window & { throwingProcessorCalls?: number })
          .throwingProcessorCalls! > 0,
    );

    const firstStop = await page.evaluate(() => {
      type RecordFunction = {
        addCustomEvent<T>(tag: string, payload: T): void;
      };
      const pageWindow = window as typeof window & {
        rrweb: { record: RecordFunction };
        throwingDisposeCalls: number;
        stopThrowingRecording?: listenerHandler;
      };
      let stopError: string | null = null;
      try {
        pageWindow.stopThrowingRecording?.();
      } catch (error) {
        stopError = String(error);
      }
      let recordingInactive = false;
      try {
        pageWindow.rrweb.record.addCustomEvent('after-first-stop', true);
      } catch {
        recordingInactive = true;
      }
      return {
        stopError,
        recordingInactive,
        disposeCalls: pageWindow.throwingDisposeCalls,
      };
    });

    expect(firstStop).toEqual({
      stopError: null,
      recordingInactive: true,
      disposeCalls: 1,
    });

    await page.evaluate(() => {
      (
        window as typeof window & { resolveThrowingProcessor?: () => void }
      ).resolveThrowingProcessor?.();
    });
    await page.waitForTimeout(50);
    expect(JSON.stringify(events)).not.toContain(lateBase64);

    const restart = await page.evaluate(() => {
      type RecordFunction = ((
        options: recordOptions<eventWithTime>,
      ) => listenerHandler | undefined) & {
        addCustomEvent<T>(tag: string, payload: T): void;
      };
      const pageWindow = window as typeof window & {
        rrweb: { record: RecordFunction };
        emitCanvasEvent: (event: eventWithTime) => void;
      };
      const stop = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordDOM: false,
      });
      let stopError: string | null = null;
      try {
        stop?.();
        stop?.();
      } catch (error) {
        stopError = String(error);
      }
      let recordingInactive = false;
      try {
        pageWindow.rrweb.record.addCustomEvent('after-restart-stop', true);
      } catch {
        recordingInactive = true;
      }
      return { stopType: typeof stop, stopError, recordingInactive };
    });

    expect(restart).toEqual({
      stopType: 'function',
      stopError: null,
      recordingInactive: true,
    });
  });

  it('does not alter pixels on a pre-existing preserveDrawingBuffer:false WebGL canvas', async () => {
    const pixelImmediatelyAfterDraw = await page.evaluate(() => {
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl', {
        preserveDrawingBuffer: false,
      })!;
      gl.clearColor(0, 0, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.clearColor(1, 0, 0, 1);
      const value = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
      return Array.from(value);
    });
    const canvasHandle = await page.$('#canvas');
    if (!canvasHandle) throw new Error('WebGL canvas missing');
    const beforeRecording = await canvasHandle.screenshot();
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
        stopCanvasRecording?: listenerHandler;
      };
      pageWindow.stopCanvasRecording = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordCanvas: true,
        sampling: { canvas: 60 },
      });
      const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
      canvas.getContext('webgl');
    });
    await page.waitForTimeout(100);
    const afterSampling = await canvasHandle.screenshot();
    await page.evaluate(() => {
      (
        window as typeof window & { stopCanvasRecording?: listenerHandler }
      ).stopCanvasRecording?.();
    });

    expect(pixelImmediatelyAfterDraw).toEqual([0, 0, 255, 255]);
    expect(afterSampling.equals(beforeRecording)).toBe(true);
  });

  it('starts and stops when WebGL constructors are unavailable', async () => {
    const stopType = await page.evaluate(() => {
      Object.defineProperty(window, 'WebGLRenderingContext', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, 'WebGL2RenderingContext', {
        configurable: true,
        value: undefined,
      });
      const pageWindow = window as typeof window & {
        rrweb: {
          record: (
            options: recordOptions<eventWithTime>,
          ) => listenerHandler | undefined;
        };
        emitCanvasEvent: (event: eventWithTime) => void;
      };
      const stop = pageWindow.rrweb.record({
        emit: pageWindow.emitCanvasEvent,
        recordCanvas: true,
      });
      const type = typeof stop;
      stop?.();
      return type;
    });

    expect(stopType).toBe('function');
  });
});
