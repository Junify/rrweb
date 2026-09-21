import * as path from 'path';
import type { Browser, Page } from 'puppeteer';
import { launchPuppeteer } from '../utils';

// Contract: seeking allocates only the canvas frames it casts, in order, and
// releases native bitmaps after drawing/cancellation. Pixel assertions allow
// implementation changes while rejecting lost, reordered, or stale frames.
describe('canvas replay resource lifetime', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await launchPuppeteer();
  });
  afterAll(async () => {
    await browser.close();
  });
  beforeEach(async () => {
    page = await browser.newPage();
    await page.addScriptTag({
      path:
        process.env.RRWEB_TEST_BUNDLE ||
        path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
    });
    await page.evaluate(() => {
      const w = window as any;
      const original = window.createImageBitmap.bind(window);
      w.stats = {
        started: 0,
        active: 0,
        maxActive: 0,
        live: 0,
        maxLive: 0,
        closed: 0,
      };
      window.createImageBitmap = (async (...args: any[]) => {
        const s = w.stats;
        s.started++;
        s.active++;
        s.maxActive = Math.max(s.active, s.maxActive);
        if (w.hold)
          await new Promise((resolve) => {
            w.release = resolve;
          });
        const bitmap = await (original as any)(...args);
        s.active--;
        s.live++;
        s.maxLive = Math.max(s.live, s.maxLive);
        const close = bitmap.close.bind(bitmap);
        bitmap.close = () => {
          s.live--;
          s.closed++;
          close();
        };
        return bitmap;
      }) as typeof createImageBitmap;
      w.snapshot = (timestamp: number) => ({
        type: 2,
        timestamp,
        data: {
          initialOffset: { top: 0, left: 0 },
          node: {
            type: 0,
            id: 1,
            childNodes: [
              {
                type: 2,
                tagName: 'html',
                id: 2,
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'head',
                    id: 3,
                    attributes: {},
                    childNodes: [],
                  },
                  {
                    type: 2,
                    tagName: 'body',
                    id: 4,
                    attributes: {},
                    childNodes: [
                      {
                        type: 2,
                        tagName: 'canvas',
                        id: 5,
                        attributes: { width: '2', height: '2' },
                        childNodes: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      });
      w.command = (timestamp: number, commands: unknown[]) => ({
        type: 3,
        timestamp,
        data: { source: 9, id: 5, type: 0, commands },
      });
      w.frame = (timestamp: number, color: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 2, 2);
        return w.command(timestamp, [
          { property: 'clearRect', args: [0, 0, 2, 2] },
          {
            property: 'drawImage',
            args: [
              {
                rr_type: 'ImageBitmap',
                args: [
                  {
                    rr_type: 'Blob',
                    type: 'image/png',
                    data: [
                      {
                        rr_type: 'ArrayBuffer',
                        base64: canvas.toDataURL().split(',')[1],
                      },
                    ],
                  },
                ],
              },
              0,
              0,
            ],
          },
        ]);
      };
      w.make = (middle: unknown[], virtual = false) => {
        w.player = new w.rrweb.Replayer(
          [
            {
              type: 4,
              timestamp: 0,
              data: { href: 'about:blank', width: 10, height: 10 },
            },
            w.snapshot(10),
            ...middle,
            { type: 0, timestamp: 10000000, data: {} },
          ],
          {
            UNSAFE_replayCanvas: true,
            useVirtualDom: virtual,
            mouseTail: false,
          },
        );
      };
      w.pixel = (x = 0) =>
        Array.from(
          w.player.iframe.contentDocument
            .querySelector('canvas')
            .getContext('2d')
            .getImageData(x, 0, 1, 1).data,
        );
    });
  });
  afterEach(async () => {
    await page.close();
  });

  it('does not decode future frames and closes frames after an ordered seek', async () => {
    await page.evaluate(() => {
      const w = window as any;
      w.make([
        w.frame(100, 'red'),
        w.frame(200, 'blue'),
        w.frame(3600000, 'green'),
      ]);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await page.evaluate(() => (window as any).stats.started)).toBe(0);
    await page.evaluate(() => (window as any).player.pause(250));
    await page.waitForFunction(() => (window as any).stats.closed === 2);
    expect(
      await page.evaluate(() => ({
        stats: (window as any).stats,
        pixel: (window as any).pixel(),
      })),
    ).toEqual({
      stats: {
        started: 2,
        active: 0,
        maxActive: 1,
        live: 0,
        maxLive: 1,
        closed: 2,
      },
      pixel: [0, 0, 255, 255],
    });
  });

  it('keeps native allocation bounded across many commands and events', async () => {
    await page.evaluate(() => {
      const w = window as any;
      const frame = w.frame(100, 'blue');
      const batch = w.command(
        100,
        Array.from({ length: 20 }, () => frame.data.commands).flat(),
      );
      w.make([
        batch,
        ...Array.from({ length: 100 }, (_, i) => ({
          ...frame,
          timestamp: 200 + i,
        })),
      ]);
      w.player.pause(500);
    });
    await page.waitForFunction(() => (window as any).stats.closed === 120);
    expect(
      await page.evaluate(() => ({
        stats: (window as any).stats,
        pixel: (window as any).pixel(),
      })),
    ).toEqual({
      stats: {
        started: 120,
        active: 0,
        maxActive: 1,
        live: 0,
        maxLive: 1,
        closed: 120,
      },
      pixel: [0, 0, 255, 255],
    });
  });

  it('cancels stale work across repeated seeks without overlapping decodes', async () => {
    await page.evaluate(() => {
      const w = window as any;
      w.make([w.frame(100, 'red'), w.snapshot(1000), w.frame(1100, 'green')]);
      w.hold = true;
      w.player.pause(150);
    });
    await page.waitForFunction(() => !!(window as any).release);
    await page.evaluate(() => {
      const w = window as any;
      w.player.pause(1150);
      w.player.pause(150);
      w.player.pause(1150);
      w.hold = false;
      w.release();
    });
    await page.waitForFunction(() => (window as any).stats.closed >= 2);
    expect(
      await page.evaluate(() => ({
        stats: (window as any).stats,
        pixel: (window as any).pixel(),
      })),
    ).toEqual({
      stats: {
        started: 2,
        active: 0,
        maxActive: 1,
        live: 0,
        maxLive: 1,
        closed: 2,
      },
      pixel: [0, 128, 0, 255],
    });
  });

  it('closes an in-flight decode after destroy without drawing or starting queued frames', async () => {
    await page.evaluate(() => {
      const w = window as any;
      w.make([w.frame(100, 'red'), w.frame(200, 'blue')]);
      w.hold = true;
      w.player.pause(250);
    });
    await page.waitForFunction(() => !!(window as any).release);
    await page.evaluate(() => {
      const w = window as any;
      w.canvas = w.player.iframe.contentDocument.querySelector('canvas');
      w.player.destroy();
      w.hold = false;
      w.release();
    });
    await page.waitForFunction(() => (window as any).stats.closed === 1);
    expect(
      await page.evaluate(() => ({
        stats: (window as any).stats,
        pixel: Array.from(
          (window as any).canvas.getContext('2d').getImageData(0, 0, 1, 1).data,
        ),
      })),
    ).toEqual({
      stats: {
        started: 1,
        active: 0,
        maxActive: 1,
        live: 0,
        maxLive: 1,
        closed: 1,
      },
      pixel: [0, 0, 0, 0],
    });
  });

  it('loads HTML image arguments before drawing', async () => {
    await page.evaluate(() => {
      const w = window as any;
      const bitmap = w.frame(100, 'red').data.commands[1].args[0];
      const src = 'data:image/png;base64,' + bitmap.args[0].data[0].base64;
      w.make([
        w.command(100, [
          {
            property: 'drawImage',
            args: [{ rr_type: 'HTMLImageElement', src }, 0, 0],
          },
        ]),
      ]);
      w.player.pause(150);
    });
    await page.waitForFunction(() => (window as any).pixel()[0] === 255);
    expect(await page.evaluate(() => (window as any).pixel())).toEqual([
      255, 0, 0, 255,
    ]);
  });

  it.each([false, true])(
    'cancels a stalled image on forward seek (new snapshot: %s)',
    async (newSnapshot) => {
      await page.evaluate((newSnapshot) => {
        const w = window as any;
        HTMLImageElement.prototype.decode = function () {
          w.imageWaiting = true;
          return new Promise(() => {});
        };
        w.make([
          w.command(100, [
            {
              property: 'drawImage',
              args: [
                { rr_type: 'HTMLImageElement', src: 'data:image/png;base64,' },
                0,
                0,
              ],
            },
          ]),
          ...(newSnapshot ? [w.snapshot(1000)] : []),
          w.frame(1100, 'green'),
        ]);
        w.player.pause(150);
      }, newSnapshot);
      await page.waitForFunction(() => (window as any).imageWaiting);
      await page.evaluate(() => (window as any).player.pause(1150));
      await page.waitForFunction(() => (window as any).stats.closed === 1);
      expect(await page.evaluate(() => (window as any).pixel())).toEqual([
        0, 128, 0, 255,
      ]);
    },
  );

  it('releases partial arguments after a decode error and continues with later commands', async () => {
    await page.evaluate(() => {
      const w = window as any;
      const broken = w.frame(100, 'red');
      broken.data.commands[1].args[1] = {
        rr_type: 'MissingConstructor',
        args: [],
      };
      w.make([broken, w.frame(200, 'green')]);
      w.player.pause(250);
    });
    await page.waitForFunction(() => (window as any).stats.closed === 2);
    expect(
      await page.evaluate(() => ({
        live: (window as any).stats.live,
        pixel: (window as any).pixel(),
      })),
    ).toEqual({ live: 0, pixel: [0, 128, 0, 255] });
  });

  it.each(['bitmap', 'image'])(
    'forward seek while waiting for %s preserves later images in the same event',
    async (waitingFor) => {
      await page.evaluate((waitingFor) => {
        const w = window as any;
        const first = w.frame(100, 'red');
        const blue = w.frame(100, 'blue').data.commands[1].args[0];
        first.data.commands.push({
          property: 'drawImage',
          args: [
            {
              rr_type: 'HTMLImageElement',
              src: 'data:image/png;base64,' + blue.args[0].data[0].base64,
            },
            0,
            0,
          ],
        });
        if (waitingFor === 'image') {
          const src =
            'data:image/png;base64,' +
            first.data.commands[1].args[0].args[0].data[0].base64;
          first.data.commands[1].args[0] = { rr_type: 'HTMLImageElement', src };
          const decode = HTMLImageElement.prototype.decode;
          HTMLImageElement.prototype.decode = function () {
            if (this.src === src) {
              w.release = () => {};
              return new Promise(() => {});
            }
            return decode.call(this);
          };
        }
        w.make([first]);
        w.hold = true;
        w.player.pause(150);
      }, waitingFor);
      await page.waitForFunction(() => !!(window as any).release);
      await page.evaluate(() => {
        const w = window as any;
        w.player.pause(250);
        w.hold = false;
        w.release();
      });
      await page.waitForFunction(() => (window as any).pixel()[2] === 255);
      expect(
        await page.evaluate(() => ({
          pixel: (window as any).pixel(),
          closed: (window as any).stats.closed,
        })),
      ).toEqual({
        pixel: [0, 0, 255, 255],
        closed: waitingFor === 'bitmap' ? 1 : 0,
      });
    },
  );

  it('serializes canvas mutations delivered by the virtual DOM flush', async () => {
    await page.evaluate(() => {
      const w = window as any;
      const mutation = {
        type: 3,
        timestamp: 50,
        data: {
          source: 0,
          adds: [],
          removes: [],
          texts: [],
          attributes: [{ id: 4, attributes: { title: 'virtual' } }],
        },
      };
      w.make([mutation, w.frame(100, 'red'), w.frame(200, 'blue')], true);
      w.virtualSeen = false;
      w.player.on('event-cast', () => {
        w.virtualSeen ||= w.player.usingVirtualDom;
      });
      // Public seek forces real DOM; exercise the service's virtual DOM flush.
      w.player.service.send({ type: 'PLAY', payload: { timeOffset: 250 } });
      w.player.pause();
    });
    await page.waitForFunction(() => (window as any).stats.closed === 2);
    expect(
      await page.evaluate(() => ({
        virtual: (window as any).virtualSeen,
        stats: (window as any).stats,
        pixel: (window as any).pixel(),
      })),
    ).toEqual({
      virtual: true,
      stats: {
        started: 2,
        active: 0,
        maxActive: 1,
        live: 0,
        maxLive: 1,
        closed: 2,
      },
      pixel: [0, 0, 255, 255],
    });
  });

  it('does not repaint a pending frame after canvas resize resets drawing state', async () => {
    await page.evaluate(() => {
      const w = window as any;
      w.make([
        w.frame(100, 'red'),
        w.command(160, [
          { property: 'fillStyle', setter: true, args: ['red'] },
        ]),
        {
          type: 3,
          timestamp: 175,
          data: {
            source: 0,
            adds: [],
            removes: [],
            texts: [],
            attributes: [{ id: 5, attributes: { width: '2' } }],
          },
        },
        w.command(200, [{ property: 'fillRect', args: [1, 0, 1, 1] }]),
      ]);
      w.hold = true;
      w.player.pause(150);
    });
    await page.waitForFunction(() => !!(window as any).release);
    await page.evaluate(() => {
      const w = window as any;
      w.player.pause(250);
      w.hold = false;
      w.release();
    });
    await page.waitForFunction(() => (window as any).pixel(1)[3] === 255);
    expect(
      await page.evaluate(() => ({
        first: (window as any).pixel(),
        second: (window as any).pixel(1),
        live: (window as any).stats.live,
      })),
    ).toEqual({ first: [0, 0, 0, 0], second: [0, 0, 0, 255], live: 0 });
  });
});
