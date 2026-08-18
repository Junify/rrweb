import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { EventType, IncrementalSource } from '@rrweb/types';
import type { eventWithTime } from '@rrweb/types';
import { launchPuppeteer } from '../utils';

type ResourceSnapshot = {
  listeners: number;
  mutationObservers: number;
  rafs: number;
  timers: number;
};

type CycleResult = {
  cycle: number;
  beforeStopEvents: number;
  afterStopEvents: number;
  resources: ResourceSnapshot;
  payloadContainsSensitiveValue: boolean;
};

type RemovalResult = {
  oldDocumentId: number;
  oldStyleId: number;
  postRemovalEvents: eventWithTime[];
  oldDocumentRetained: boolean;
  oldStyleRetained: boolean;
  liveSharedSheetEvents: number;
  releasedSharedSheetEvents: number;
  reAdoptedDefinitionEvents: number;
  reAdoptedRuleEvents: number;
};

const installResourceCensus = `
  (() => {
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const nativeObserve = MutationObserver.prototype.observe;
    const nativeDisconnect = MutationObserver.prototype.disconnect;
    const nativeTakeRecords = MutationObserver.prototype.takeRecords;
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCancelRAF = window.cancelAnimationFrame.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);

    const listenerTargets = new Map();
    const activeObservers = new Set();
    const pendingRAFs = new Set();
    const pendingTimers = new Set();

    const capture = (options) =>
      typeof options === 'boolean' ? options : Boolean(options && options.capture);
    const listenersFor = (target) => {
      let listeners = listenerTargets.get(target);
      if (!listeners) {
        listeners = [];
        listenerTargets.set(target, listeners);
      }
      return listeners;
    };

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (listener) {
        const listeners = listenersFor(this);
        if (!listeners.some((entry) =>
          entry.type === type && entry.listener === listener &&
          entry.capture === capture(options))) {
          listeners.push({ type, listener, capture: capture(options) });
        }
      }
      return nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const listeners = listenersFor(this);
      const index = listeners.findIndex((entry) =>
        entry.type === type && entry.listener === listener &&
        entry.capture === capture(options));
      if (index !== -1) listeners.splice(index, 1);
      return nativeRemove.call(this, type, listener, options);
    };
    MutationObserver.prototype.observe = function(...args) {
      activeObservers.add(this);
      return nativeObserve.apply(this, args);
    };
    MutationObserver.prototype.disconnect = function() {
      activeObservers.delete(this);
      return nativeDisconnect.call(this);
    };
    MutationObserver.prototype.takeRecords = function() {
      return nativeTakeRecords.call(this);
    };
    window.requestAnimationFrame = function(callback) {
      let id;
      id = nativeRAF((timestamp) => {
        pendingRAFs.delete(id);
        callback(timestamp);
      });
      pendingRAFs.add(id);
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      pendingRAFs.delete(id);
      return nativeCancelRAF(id);
    };
    window.setTimeout = function(callback, delay, ...args) {
      let id;
      id = nativeSetTimeout(() => {
        pendingTimers.delete(id);
        if (typeof callback === 'function') callback(...args);
      }, delay);
      pendingTimers.add(id);
      return id;
    };
    window.clearTimeout = function(id) {
      pendingTimers.delete(id);
      return nativeClearTimeout(id);
    };

    window.__rrwebLifecycleCensus = {
      snapshot() {
        let listeners = 0;
        listenerTargets.forEach((entries) => { listeners += entries.length; });
        return {
          listeners,
          mutationObservers: activeObservers.size,
          rafs: pendingRAFs.size,
          timers: pendingTimers.size,
        };
      },
      wait(milliseconds) {
        return new Promise((resolve) => nativeSetTimeout(resolve, milliseconds));
      },
      frame() {
        return new Promise((resolve) => nativeRAF(() => resolve()));
      },
    };
  })();
`;

describe('recorder lifecycle', () => {
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  let code: string;

  beforeAll(async () => {
    browser = await launchPuppeteer();
    code = fs.readFileSync(
      path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
      'utf8',
    );
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.evaluate(installResourceCensus);
    await page.evaluate(code);
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('releases listeners, observers, timers, and Canvas RAFs over 50 start/stop cycles', async () => {
    const result = await page.evaluate(async () => {
      const lifecycle = (
        window as unknown as {
          __rrwebLifecycleCensus: {
            snapshot(): ResourceSnapshot;
            wait(milliseconds: number): Promise<void>;
            frame(): Promise<void>;
          };
        }
      ).__rrwebLifecycleCensus;
      const rrweb = (
        window as unknown as {
          rrweb: {
            record(options: {
              emit(event: eventWithTime): void;
              recordCanvas: boolean;
              recordCrossOriginIframes: boolean;
              sampling: { canvas: 'all'; scroll: number };
            }): (() => void) | undefined;
          };
        }
      ).rrweb;
      const baseline = lifecycle.snapshot();
      const cycles: CycleResult[] = [];

      for (let cycle = 0; cycle < 50; cycle++) {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span>shadow-before</span>';
        document.body.appendChild(host);

        const canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        const input = document.createElement('input');
        document.body.appendChild(input);
        const iframe = document.createElement('iframe');
        iframe.srcdoc =
          '<!doctype html><style>p { color: red }</style><p>frame</p>';
        document.body.appendChild(iframe);
        while (!iframe.contentDocument?.querySelector('p')) {
          await lifecycle.wait(5);
        }

        const events: eventWithTime[] = [];
        const stop = rrweb.record({
          emit: (event) => events.push(event),
          recordCanvas: true,
          recordCrossOriginIframes: true,
          sampling: { canvas: 'all', scroll: 1_000 },
        });
        if (!stop) throw new Error(`record() did not start at cycle ${cycle}`);

        await lifecycle.frame();
        await lifecycle.frame();
        shadow.querySelector('span')!.textContent = `shadow-${cycle}`;
        iframe.contentDocument!.querySelector(
          'p',
        )!.textContent = `frame-${cycle}`;
        canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
        input.type = 'password';
        input.value = `secret-${cycle}`;
        document.dispatchEvent(new Event('scroll'));
        document.dispatchEvent(new Event('scroll'));

        const beforeStopEvents = events.length;
        stop();
        stop();
        const resources = lifecycle.snapshot();

        shadow.querySelector('span')!.textContent = `after-stop-${cycle}`;
        iframe.contentDocument!.querySelector(
          'p',
        )!.textContent = `after-stop-${cycle}`;
        canvas.getContext('2d')!.fillRect(2, 2, 2, 2);
        document.dispatchEvent(new Event('scroll'));
        await lifecycle.wait(1_050);

        cycles.push({
          cycle,
          beforeStopEvents,
          afterStopEvents: events.length,
          resources,
          payloadContainsSensitiveValue: JSON.stringify(events).includes(
            `secret-${cycle}`,
          ),
        });
        iframe.remove();
        canvas.remove();
        input.remove();
        host.remove();
      }

      return { baseline, cycles, final: lifecycle.snapshot() };
    });

    console.info(
      'rrweb lifecycle stable census',
      JSON.stringify({
        baseline: result.baseline,
        first: result.cycles[0],
        last: result.cycles[result.cycles.length - 1],
        final: result.final,
      }),
    );
    for (const cycle of result.cycles) {
      expect(
        cycle.afterStopEvents,
        `post-stop emit in cycle ${cycle.cycle}`,
      ).toBe(cycle.beforeStopEvents);
      expect(
        cycle.resources,
        `retained resources in cycle ${cycle.cycle}`,
      ).toEqual(result.baseline);
      expect(cycle.payloadContainsSensitiveValue).toBe(false);
    }
    expect(result.final).toEqual(result.baseline);
  }, 120_000);

  it('releases pending stylesheet load listeners and timers on every stop', async () => {
    const result = await page.evaluate(() => {
      const lifecycle = (
        window as unknown as {
          __rrwebLifecycleCensus: {
            snapshot(): ResourceSnapshot;
          };
        }
      ).__rrwebLifecycleCensus;
      const rrweb = (
        window as unknown as {
          rrweb: {
            record(options: {
              emit(event: eventWithTime): void;
            }): (() => void) | undefined;
          };
        }
      ).rrweb;
      const baseline = lifecycle.snapshot();
      const cycles: ResourceSnapshot[] = [];

      for (let cycle = 0; cycle < 10; cycle++) {
        const pendingStylesheet = document.createElement('link');
        pendingStylesheet.rel = 'stylesheet';
        document.head.appendChild(pendingStylesheet);
        const stop = rrweb.record({ emit: () => undefined });
        if (!stop) throw new Error(`record() did not start at cycle ${cycle}`);
        stop();
        stop();
        cycles.push(lifecycle.snapshot());
        pendingStylesheet.remove();
      }

      return { baseline, cycles, final: lifecycle.snapshot() };
    });

    result.cycles.forEach((resources, cycle) => {
      expect(
        resources,
        `pending stylesheet retained in cycle ${cycle}`,
      ).toEqual(result.baseline);
    });
    expect(result.final).toEqual(result.baseline);
  });

  it('releases permanently removed iframe, stylesheet, and shadow-root state while preserving a shared live sheet', async () => {
    const result = await page.evaluate(
      async ({
        incrementalSnapshotType,
        styleSheetRuleSource,
        adoptedStyleSheetSource,
      }) => {
        const lifecycle = (
          window as unknown as {
            __rrwebLifecycleCensus: {
              wait(milliseconds: number): Promise<void>;
              frame(): Promise<void>;
            };
          }
        ).__rrwebLifecycleCensus;
        const rrweb = (
          window as unknown as {
            rrweb: {
              record: ((options: {
                emit(event: eventWithTime): void;
              }) => (() => void) | undefined) & {
                mirror: {
                  getId(node: Node): number;
                  getNode(id: number): Node | null;
                  hasNode(node: Node): boolean;
                };
              };
            };
          }
        ).rrweb;

        const style = document.createElement('style');
        style.textContent = '.removed-style { color: red }';
        document.head.appendChild(style);
        const oldStyleSheet = style.sheet!;

        const iframe = document.createElement('iframe');
        iframe.srcdoc =
          '<!doctype html><style>p { color: red }</style><p>frame</p>';
        document.body.appendChild(iframe);
        while (
          !iframe.contentDocument?.querySelector('p') ||
          !iframe.contentDocument.styleSheets.length
        ) {
          await lifecycle.wait(5);
        }
        const oldDocument = iframe.contentDocument!;
        const oldFrameSheet = oldDocument.styleSheets[0] as CSSStyleSheet;

        const sharedSheet = new CSSStyleSheet();
        sharedSheet.replaceSync('.shared { color: red }');
        document.adoptedStyleSheets = [sharedSheet];
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sharedSheet];
        shadow.innerHTML = '<span class="shared">shared</span>';
        document.body.appendChild(host);

        const events: eventWithTime[] = [];
        const stop = rrweb.record({ emit: (event) => events.push(event) });
        if (!stop) throw new Error('record() did not start');
        await lifecycle.frame();
        await lifecycle.frame();

        const oldDocumentId = rrweb.record.mirror.getId(oldDocument);
        const oldStyleId = rrweb.record.mirror.getId(style);
        events.length = 0;
        iframe.remove();
        style.remove();
        host.remove();
        await lifecycle.frame();
        await lifecycle.frame();
        events.length = 0;

        oldStyleSheet.insertRule('.removed-style-two { color: blue }', 0);
        oldFrameSheet.insertRule('p { background: black }', 0);
        await lifecycle.frame();
        const postRemovalEvents = JSON.parse(JSON.stringify(events));
        const oldDocumentRetained =
          rrweb.record.mirror.getNode(oldDocumentId) === oldDocument ||
          rrweb.record.mirror.hasNode(oldDocument);
        const oldStyleRetained =
          rrweb.record.mirror.getNode(oldStyleId) === style ||
          rrweb.record.mirror.hasNode(style);

        events.length = 0;
        sharedSheet.replaceSync('.shared { color: green }');
        await lifecycle.frame();
        const liveSharedSheetEvents = events.filter(
          (event) =>
            event.type === incrementalSnapshotType &&
            event.data.source === styleSheetRuleSource,
        ).length;

        document.adoptedStyleSheets = [];
        await lifecycle.frame();
        events.length = 0;
        sharedSheet.replaceSync('.shared { color: blue }');
        await lifecycle.frame();
        const releasedSharedSheetEvents = events.filter(
          (event) =>
            event.type === incrementalSnapshotType &&
            event.data.source === styleSheetRuleSource,
        ).length;

        events.length = 0;
        document.adoptedStyleSheets = [sharedSheet];
        await lifecycle.frame();
        const reAdoptedDefinitionEvents = events.filter(
          (event) =>
            event.type === incrementalSnapshotType &&
            event.data.source === adoptedStyleSheetSource &&
            'styles' in event.data &&
            Array.isArray(event.data.styles) &&
            event.data.styles.length > 0,
        ).length;
        events.length = 0;
        sharedSheet.replaceSync('.shared { color: orange }');
        await lifecycle.frame();
        const reAdoptedRuleEvents = events.filter(
          (event) =>
            event.type === incrementalSnapshotType &&
            event.data.source === styleSheetRuleSource,
        ).length;
        stop();

        return {
          oldDocumentId,
          oldStyleId,
          postRemovalEvents,
          oldDocumentRetained,
          oldStyleRetained,
          liveSharedSheetEvents,
          releasedSharedSheetEvents,
          reAdoptedDefinitionEvents,
          reAdoptedRuleEvents,
        } satisfies RemovalResult;
      },
      {
        incrementalSnapshotType: EventType.IncrementalSnapshot,
        styleSheetRuleSource: IncrementalSource.StyleSheetRule,
        adoptedStyleSheetSource: IncrementalSource.AdoptedStyleSheet,
      },
    );

    console.info(
      'rrweb removed subtree census',
      JSON.stringify({
        postRemovalEvents: result.postRemovalEvents.length,
        oldDocumentRetained: result.oldDocumentRetained,
        oldStyleRetained: result.oldStyleRetained,
        liveSharedSheetEvents: result.liveSharedSheetEvents,
        releasedSharedSheetEvents: result.releasedSharedSheetEvents,
        reAdoptedDefinitionEvents: result.reAdoptedDefinitionEvents,
        reAdoptedRuleEvents: result.reAdoptedRuleEvents,
      }),
    );
    expect(result.oldDocumentId).toBeGreaterThan(0);
    expect(result.oldStyleId).toBeGreaterThan(0);
    expect(result.postRemovalEvents).toEqual([]);
    expect(result.oldDocumentRetained).toBe(false);
    expect(result.oldStyleRetained).toBe(false);
    expect(result.liveSharedSheetEvents).toBe(1);
    expect(result.releasedSharedSheetEvents).toBe(0);
    expect(result.reAdoptedDefinitionEvents).toBe(1);
    expect(result.reAdoptedRuleEvents).toBe(1);
  }, 30_000);

  it('replaces iframe observer generations on navigation and releases the removed generation', async () => {
    const result = await page.evaluate(async () => {
      const lifecycle = (
        window as unknown as {
          __rrwebLifecycleCensus: {
            snapshot(): ResourceSnapshot;
            wait(milliseconds: number): Promise<void>;
            frame(): Promise<void>;
          };
        }
      ).__rrwebLifecycleCensus;
      const rrweb = (
        window as unknown as {
          rrweb: {
            record: ((options: {
              emit(event: eventWithTime): void;
            }) => (() => void) | undefined) & {
              mirror: {
                hasNode(node: Node): boolean;
              };
            };
          };
        }
      ).rrweb;
      const baseline = lifecycle.snapshot();
      const iframe = document.createElement('iframe');
      iframe.srcdoc = '<!doctype html><style>p{color:red}</style><p>first</p>';
      document.body.appendChild(iframe);
      while (!iframe.contentDocument?.querySelector('p')) {
        await lifecycle.wait(5);
      }
      const firstDocument = iframe.contentDocument!;
      const firstParagraph = firstDocument.querySelector('p')!;
      const firstSheet = firstDocument.styleSheets[0] as CSSStyleSheet;
      const events: eventWithTime[] = [];
      const stop = rrweb.record({ emit: (event) => events.push(event) });
      if (!stop) throw new Error('record() did not start');
      await lifecycle.frame();
      await lifecycle.frame();

      events.length = 0;
      const firstWindow = firstDocument.defaultView!;
      firstWindow.dispatchEvent(new firstWindow.Event('pagehide'));
      firstParagraph.textContent = 'stale-before-replacement';
      firstSheet.insertRule('p { outline: 1px solid black }', 0);
      await lifecycle.frame();
      const pagehideGenerationEvents = events.length;
      const oldDocumentRetainedAfterPagehide =
        rrweb.record.mirror.hasNode(firstDocument);

      iframe.srcdoc =
        '<!doctype html><style>p{color:blue}</style><p>second</p>';
      while (
        iframe.contentDocument === firstDocument ||
        !iframe.contentDocument?.querySelector('p')
      ) {
        await lifecycle.wait(5);
      }
      const secondDocument = iframe.contentDocument!;
      const secondParagraph = secondDocument.querySelector('p')!;
      await lifecycle.frame();
      await lifecycle.frame();

      events.length = 0;
      firstParagraph.textContent = 'stale-first';
      firstSheet.insertRule('p { background: black }', 0);
      await lifecycle.frame();
      const staleGenerationEvents = events.length;

      events.length = 0;
      secondParagraph.textContent = 'live-second';
      await lifecycle.frame();
      const liveGenerationEvents = events.length;
      const oldDocumentRetainedAfterNavigation =
        rrweb.record.mirror.hasNode(firstDocument);
      const liveDocumentRecorded = rrweb.record.mirror.hasNode(secondDocument);

      events.length = 0;
      iframe.remove();
      await lifecycle.frame();
      await lifecycle.frame();
      events.length = 0;
      secondParagraph.textContent = 'stale-second';
      await lifecycle.frame();
      const removedGenerationEvents = events.length;
      const removedDocumentRetained =
        rrweb.record.mirror.hasNode(secondDocument);
      stop();

      return {
        baseline,
        final: lifecycle.snapshot(),
        pagehideGenerationEvents,
        staleGenerationEvents,
        liveGenerationEvents,
        removedGenerationEvents,
        oldDocumentRetainedAfterNavigation,
        oldDocumentRetainedAfterPagehide,
        liveDocumentRecorded,
        removedDocumentRetained,
      };
    });

    expect(result.pagehideGenerationEvents).toBe(0);
    expect(result.oldDocumentRetainedAfterPagehide).toBe(false);
    expect(result.staleGenerationEvents).toBe(0);
    expect(result.liveGenerationEvents).toBeGreaterThan(0);
    expect(result.removedGenerationEvents).toBe(0);
    expect(result.oldDocumentRetainedAfterNavigation).toBe(false);
    expect(result.liveDocumentRecorded).toBe(true);
    expect(result.removedDocumentRetained).toBe(false);
    expect(result.final).toEqual(result.baseline);
  }, 30_000);

  it('releases removed shadow roots and records a replacement shadow root', async () => {
    const result = await page.evaluate(async () => {
      const lifecycle = (
        window as unknown as {
          __rrwebLifecycleCensus: {
            snapshot(): ResourceSnapshot;
            frame(): Promise<void>;
          };
        }
      ).__rrwebLifecycleCensus;
      const rrweb = (
        window as unknown as {
          rrweb: {
            record: ((options: {
              emit(event: eventWithTime): void;
            }) => (() => void) | undefined) & {
              mirror: { hasNode(node: Node): boolean };
            };
          };
        }
      ).rrweb;
      const baseline = lifecycle.snapshot();
      const oldHost = document.createElement('div');
      const oldShadow = oldHost.attachShadow({ mode: 'open' });
      oldShadow.innerHTML = '<span>old</span>';
      const oldSpan = oldShadow.querySelector('span')!;
      document.body.appendChild(oldHost);
      const events: eventWithTime[] = [];
      const stop = rrweb.record({ emit: (event) => events.push(event) });
      if (!stop) throw new Error('record() did not start');
      await lifecycle.frame();
      await lifecycle.frame();

      oldHost.remove();
      await lifecycle.frame();
      await lifecycle.frame();
      events.length = 0;
      oldSpan.textContent = 'stale';
      await lifecycle.frame();
      const staleEvents = events.length;
      const oldShadowRetained = rrweb.record.mirror.hasNode(oldSpan);

      const newHost = document.createElement('div');
      const newShadow = newHost.attachShadow({ mode: 'open' });
      newShadow.innerHTML = '<span>new</span>';
      document.body.appendChild(newHost);
      await lifecycle.frame();
      await lifecycle.frame();
      events.length = 0;
      newShadow.querySelector('span')!.textContent = 'live';
      await lifecycle.frame();
      const liveEvents = events.length;
      stop();

      return {
        baseline,
        final: lifecycle.snapshot(),
        staleEvents,
        oldShadowRetained,
        liveEvents,
      };
    });

    expect(result.staleEvents).toBe(0);
    expect(result.oldShadowRetained).toBe(false);
    expect(result.liveEvents).toBeGreaterThan(0);
    expect(result.final).toEqual(result.baseline);
  }, 30_000);

  it('contains throwing cleanup callbacks and continues disposing later observers', async () => {
    const result = await page.evaluate(async () => {
      const lifecycle = (
        window as unknown as {
          __rrwebLifecycleCensus: {
            snapshot(): ResourceSnapshot;
            frame(): Promise<void>;
          };
        }
      ).__rrwebLifecycleCensus;
      const rrweb = (
        window as unknown as {
          rrweb: {
            record: ((options: {
              emit(event: eventWithTime): void;
              collectFonts: boolean;
              recordCanvas: boolean;
              sampling: { canvas: 'all' };
              errorHandler(error: unknown): boolean;
              plugins: Array<{
                name: string;
                observer(): () => void;
              }>;
            }) => (() => void) | undefined) & {
              addCustomEvent(tag: string, payload: unknown): void;
              mirror: { hasNode(node: Node): boolean };
            };
          };
        }
      ).rrweb;
      const baseline = lifecycle.snapshot();
      let laterCleanupCount = 0;
      const events: eventWithTime[] = [];
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const pendingStylesheet = document.createElement('link');
      pendingStylesheet.rel = 'stylesheet';
      document.head.appendChild(pendingStylesheet);
      const stop = rrweb.record({
        emit: (event) => events.push(event),
        collectFonts: true,
        recordCanvas: true,
        sampling: { canvas: 'all' },
        errorHandler: () => true,
        plugins: [
          {
            name: 'throwing-cleanup',
            observer: () => () => {
              throw new Error('expected cleanup failure');
            },
          },
          {
            name: 'later-cleanup',
            observer: () => () => {
              laterCleanupCount++;
            },
          },
        ],
      });
      if (!stop) throw new Error('record() did not start');
      await lifecycle.frame();
      canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
      const savedWrappedInsertRule = CSSStyleSheet.prototype.insertRule;
      const font = new FontFace(
        'LifecycleCleanup',
        'url(data:font/woff2;base64,d09GMgABAAAAAA)',
      );
      document.fonts.add(font);
      const trackedCancelAnimationFrame = window.cancelAnimationFrame;
      let cancelAnimationFrameCalls = 0;
      window.cancelAnimationFrame = () => {
        cancelAnimationFrameCalls++;
        throw new Error('expected cancelAnimationFrame cleanup failure');
      };
      let stopThrew = false;
      try {
        stop();
        stop();
      } catch {
        stopThrew = true;
      }
      window.cancelAnimationFrame = trackedCancelAnimationFrame;
      const eventsAtStop = events.length;
      document.body.appendChild(document.createElement('div'));
      await lifecycle.frame();
      await lifecycle.frame();
      let recordingAfterStop = true;
      try {
        rrweb.record.addCustomEvent('after-stop', {});
      } catch {
        recordingAfterStop = false;
      }
      let savedProxyErrorEscaped = false;
      try {
        savedWrappedInsertRule.call({} as CSSStyleSheet, 'body {}', 0);
      } catch {
        savedProxyErrorEscaped = true;
      }
      return {
        baseline,
        final: lifecycle.snapshot(),
        stopThrew,
        cancelAnimationFrameCalls,
        laterCleanupCount,
        eventsAtStop,
        eventsAfterStop: events.length,
        recordingAfterStop,
        savedProxyErrorEscaped,
        mirrorReleased: !rrweb.record.mirror.hasNode(canvas),
      };
    });

    expect(result.stopThrew).toBe(false);
    expect(result.cancelAnimationFrameCalls).toBeGreaterThan(0);
    expect(result.laterCleanupCount).toBe(1);
    expect(result.eventsAfterStop).toBe(result.eventsAtStop);
    expect(result.recordingAfterStop).toBe(false);
    expect(result.savedProxyErrorEscaped).toBe(true);
    expect(result.mirrorReleased).toBe(true);
    expect(result.final).toEqual(result.baseline);
  }, 30_000);
});
