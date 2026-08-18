import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import {
  CanvasContext,
  EventType,
  IncrementalSource,
  MediaInteractions,
  NodeType,
  ReplayerEvents,
} from '@rrweb/types';
import type { eventWithTime, serializedNodeWithId } from '@rrweb/types';
import iframeEvents from '../events/iframe';
import { launchPuppeteer } from '../utils';

type ResourceSnapshot = {
  listeners: number;
  rafs: number;
  timeouts: number;
  intervals: number;
  strongWebGLContexts: number;
};

const installResourceCensus = `
  (() => {
    const NativeMap = window.Map;
    const NativeSet = window.Set;
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCancelRAF = window.cancelAnimationFrame.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const listenerTargets = new NativeMap();
    const pendingRAFs = new NativeSet();
    const pendingTimeouts = new NativeSet();
    const pendingIntervals = new NativeSet();
    const strongWebGLContexts = new NativeSet();

    const isWebGLContext = (value) =>
      (typeof WebGLRenderingContext !== 'undefined' &&
        value instanceof WebGLRenderingContext) ||
      (typeof WebGL2RenderingContext !== 'undefined' &&
        value instanceof WebGL2RenderingContext) ||
      value?.constructor?.name === 'WebGLRenderingContext' ||
      value?.constructor?.name === 'WebGL2RenderingContext';
    class LifecycleMap extends NativeMap {
      set(key, value) {
        if (isWebGLContext(key)) strongWebGLContexts.add(key);
        return super.set(key, value);
      }
      delete(key) {
        if (isWebGLContext(key)) strongWebGLContexts.delete(key);
        return super.delete(key);
      }
      clear() {
        for (const key of this.keys()) {
          if (isWebGLContext(key)) strongWebGLContexts.delete(key);
        }
        return super.clear();
      }
    }
    window.Map = LifecycleMap;

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
        pendingTimeouts.delete(id);
        if (typeof callback === 'function') callback(...args);
      }, delay);
      pendingTimeouts.add(id);
      return id;
    };
    window.clearTimeout = function(id) {
      pendingTimeouts.delete(id);
      return nativeClearTimeout(id);
    };
    window.setInterval = function(callback, delay, ...args) {
      const id = nativeSetInterval(callback, delay, ...args);
      pendingIntervals.add(id);
      return id;
    };
    window.clearInterval = function(id) {
      pendingIntervals.delete(id);
      return nativeClearInterval(id);
    };

    window.__rrwebReplayLifecycleCensus = {
      snapshot() {
        let listeners = 0;
        listenerTargets.forEach((entries) => { listeners += entries.length; });
        return {
          listeners,
          rafs: pendingRAFs.size,
          timeouts: pendingTimeouts.size,
          intervals: pendingIntervals.size,
          strongWebGLContexts: strongWebGLContexts.size,
        };
      },
      wait(milliseconds) {
        return new Promise((resolve) => nativeSetTimeout(resolve, milliseconds));
      },
      frame() {
        return new Promise((resolve) => nativeRAF(() => resolve()));
      },
      timeout(callback, milliseconds) {
        return nativeSetTimeout(callback, milliseconds);
      },
      clearTimeout(id) {
        nativeClearTimeout(id);
      },
    };
  })();
`;

function findNode(
  node: serializedNodeWithId,
  id: number,
): serializedNodeWithId | null {
  if (node.id === id) return node;
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const match = findNode(child, id);
      if (match) return match;
    }
  }
  return null;
}

function lifecycleEvents(): eventWithTime[] {
  const events = JSON.parse(JSON.stringify(iframeEvents)) as eventWithTime[];
  const fullSnapshot = events.find(
    (event) => event.type === EventType.FullSnapshot,
  );
  if (!fullSnapshot || fullSnapshot.type !== EventType.FullSnapshot) {
    throw new Error('iframe lifecycle FullSnapshot missing');
  }
  const head = findNode(fullSnapshot.data.node, 4);
  const body = findNode(fullSnapshot.data.node, 5);
  if (!head || !body || !('childNodes' in head) || !('childNodes' in body)) {
    throw new Error('iframe lifecycle head/body missing');
  }
  head.childNodes.push({
    id: 90_001,
    type: NodeType.Element,
    tagName: 'link',
    attributes: {
      rel: 'stylesheet',
      href: 'https://rrweb-lifecycle.invalid/pending.css',
    },
    childNodes: [],
  });
  body.childNodes.push(
    {
      id: 90_002,
      type: NodeType.Element,
      tagName: 'video',
      attributes: {},
      childNodes: [],
    },
    {
      id: 90_003,
      type: NodeType.Element,
      tagName: 'canvas',
      attributes: { width: '8', height: '8' },
      childNodes: [],
    },
  );

  const startTime = events[0].timestamp;
  events.push(
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MediaInteraction,
        type: MediaInteractions.Play,
        id: 90_002,
        currentTime: 1,
      },
      timestamp: startTime + 300,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MouseMove,
        positions: [{ x: 10, y: 10, id: 5, timeOffset: 0 }],
      },
      timestamp: startTime + 320,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.AdoptedStyleSheet,
        id: 1,
        styleIds: [99_999],
        styles: [],
      },
      timestamp: startTime + 340,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.CanvasMutation,
        id: 90_003,
        type: CanvasContext['2D'],
        property: 'drawImage',
        args: [
          {
            rr_type: 'HTMLImageElement',
            src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          },
          0,
          0,
        ],
      },
      timestamp: startTime + 350,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.CanvasMutation,
        id: 90_003,
        type: CanvasContext.WebGL,
        property: 'createBuffer',
        args: [],
      },
      timestamp: startTime + 360,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        adds: [
          {
            parentId: 5,
            previousId: -1,
            nextId: null,
            node: {
              id: 90_004,
              type: NodeType.Text,
              textContent: 'legacy pending sibling',
            },
          },
          {
            parentId: 99_998,
            previousId: null,
            nextId: null,
            node: {
              id: 90_005,
              type: NodeType.Document,
              childNodes: [],
            },
          },
        ],
        removes: [],
        texts: [],
        attributes: [],
      },
      timestamp: startTime + 380,
    },
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        adds: [
          {
            parentId: 5,
            previousId: -1,
            nextId: null,
            node: {
              id: 90_006,
              type: NodeType.Text,
              textContent: 'late legacy pending sibling',
            },
          },
        ],
        removes: [],
        texts: [],
        attributes: [],
      },
      timestamp: startTime + 1_690,
    },
    {
      type: EventType.Custom,
      data: { tag: 'replayer-lifecycle-ready', payload: {} },
      timestamp: startTime + 1_700,
    },
  );
  return events.sort((left, right) => left.timestamp - right.timestamp);
}

describe('replayer lifecycle', () => {
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
    await page.evaluate(installResourceCensus);
    await page.evaluate(code);
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('releases every owned resource over 50 iframe-heavy play, seek, live, and destroy cycles', async () => {
    const results = await page.evaluate(
      async ({ events, eventTypes, readyTimestamp }) => {
        type ListenerProbe = {
          node: EventTarget;
          loadBalance: number;
          errorBalance: number;
          metadataBalance: number;
        };
        type ReplayerInternals = {
          wrapper: HTMLDivElement;
          iframe: HTMLIFrameElement;
          timer: {
            isActive(): boolean;
            actions: unknown[];
            addAction(action: { delay: number; doAction(): void }): void;
            clear(): void;
            start(): void;
          };
          service: {
            status: number;
            send(event: unknown): void;
          };
          speedService: {
            status: number;
            send(event: unknown): void;
          };
          emitter: { all: Map<string, unknown[]> };
          imageMap: Map<unknown, unknown>;
          canvasEventMap: Map<unknown, unknown>;
          legacy_missingNodeRetryMap: Record<string, unknown>;
          newDocumentQueue: unknown[];
          constructedStyleMutations: unknown[];
          adoptedStyleSheets: unknown[];
          mediaManager: {
            mediaMap: Map<unknown, unknown>;
            metadataCallbackMap: Map<unknown, unknown>;
            mediaMutation(options: {
              target: HTMLMediaElement;
              timeOffset: number;
              mutation: Record<string, unknown>;
            }): void;
          };
          getMirror(): { getIds(): number[] };
          on(event: string, handler: (event?: unknown) => void): void;
          pause(offset?: number): void;
          play(offset?: number): void;
          startLive(offset?: number): void;
          addEvent(event: unknown): void;
          destroy(): void;
        };
        type LifecycleCensus = {
          snapshot(): ResourceSnapshot;
          wait(milliseconds: number): Promise<void>;
          frame(): Promise<void>;
          timeout(callback: () => void, milliseconds: number): number;
          clearTimeout(id: number): void;
        };
        const lifecycle = (
          window as typeof window & {
            __rrwebReplayLifecycleCensus: LifecycleCensus;
          }
        ).__rrwebReplayLifecycleCensus;
        const Replayer = (
          window as typeof window & {
            rrweb: {
              Replayer: new (
                events: eventWithTime[],
                options: Record<string, unknown>,
              ) => ReplayerInternals;
            };
          }
        ).rrweb.Replayer;
        const baseline = lifecycle.snapshot();
        const cycles = [];

        const inspect = (replayer: ReplayerInternals) => ({
          timerActive: replayer.timer.isActive(),
          timerActions: replayer.timer.actions.length,
          serviceStatus: replayer.service.status,
          speedServiceStatus: replayer.speedService.status,
          emitterHandlers: Array.from(replayer.emitter.all.values()).reduce(
            (total, handlers) => total + handlers.length,
            0,
          ),
          imageMap: replayer.imageMap.size,
          canvasEventMap: replayer.canvasEventMap.size,
          legacyMissingNodes: Object.keys(replayer.legacy_missingNodeRetryMap)
            .length,
          newDocumentQueue: replayer.newDocumentQueue.length,
          constructedStyleMutations: replayer.constructedStyleMutations.length,
          adoptedStyleSheets: replayer.adoptedStyleSheets.length,
          mediaElements: replayer.mediaManager.mediaMap.size,
          metadataCallbacks: replayer.mediaManager.metadataCallbackMap.size,
          mirrorIds: replayer.getMirror().getIds().length,
          wrapperAttached: replayer.wrapper.isConnected,
          nestedIframes:
            replayer.iframe.contentDocument?.querySelectorAll('iframe')
              .length || 0,
        });

        for (let cycle = 0; cycle < 50; cycle++) {
          const root = document.createElement('div');
          document.body.appendChild(root);
          const linkProbes: ListenerProbe[] = [];
          const mediaProbes: ListenerProbe[] = [];
          const eventCounts = {
            destroy: 0,
            stateChange: 0,
            finish: 0,
            loadStylesheetEnd: 0,
            eventCast: 0,
            ownedTimerCallback: 0,
          };
          const replayer = new Replayer(events, {
            root,
            speed: 100,
            loadTimeout: 60_000,
            mouseTail: {
              duration: 60_000,
              lineCap: 'round',
              lineWidth: 3,
              strokeStyle: 'red',
            },
            showWarning: false,
            UNSAFE_replayCanvas: true,
            useVirtualDom: true,
          });

          const countIframes = (replayDocument: Document | null): number => {
            if (!replayDocument) return 0;
            return Array.from(replayDocument.querySelectorAll('iframe')).reduce(
              (total, iframe) => {
                let nested = 0;
                try {
                  nested = countIframes(iframe.contentDocument);
                } catch {
                  // All lifecycle fixtures are same-origin. Keep the census
                  // defensive if a browser temporarily withholds a document.
                }
                return total + 1 + nested;
              },
              0,
            );
          };
          const patchListenerProbe = (
            node: EventTarget,
            probes: ListenerProbe[],
          ) => {
            const probe = {
              node,
              loadBalance: 0,
              errorBalance: 0,
              metadataBalance: 0,
            };
            probes.push(probe);
            const nativeAdd = node.addEventListener.bind(node);
            const nativeRemove = node.removeEventListener.bind(node);
            node.addEventListener = ((type, listener, options) => {
              if (type === 'load') probe.loadBalance++;
              if (type === 'error') probe.errorBalance++;
              if (type === 'loadedmetadata') probe.metadataBalance++;
              nativeAdd(type, listener, options);
            }) as typeof node.addEventListener;
            node.removeEventListener = ((type, listener, options) => {
              if (type === 'load') probe.loadBalance--;
              if (type === 'error') probe.errorBalance--;
              if (type === 'loadedmetadata') probe.metadataBalance--;
              nativeRemove(type, listener, options);
            }) as typeof node.removeEventListener;
          };
          replayer.on(eventTypes.fullSnapshotRebuilt, () => {
            const replayDocument = replayer.iframe.contentDocument;
            const link = replayDocument?.querySelector('link');
            const video = replayDocument?.querySelector('video');
            if (link) patchListenerProbe(link, linkProbes);
            if (video) {
              patchListenerProbe(video, mediaProbes);
              Object.defineProperty(video, 'duration', {
                configurable: true,
                value: Number.NaN,
              });
            }
          });
          replayer.on(eventTypes.destroy, () => eventCounts.destroy++);
          replayer.on(eventTypes.stateChange, () => eventCounts.stateChange++);
          replayer.on(eventTypes.finish, () => eventCounts.finish++);
          replayer.on(
            eventTypes.loadStylesheetEnd,
            () => eventCounts.loadStylesheetEnd++,
          );
          replayer.on(eventTypes.eventCast, () => eventCounts.eventCast++);

          replayer.pause(1_600);
          const forwardSeekIframes = countIframes(
            replayer.iframe.contentDocument,
          );
          replayer.pause(100);
          replayer.play(200);
          await lifecycle.wait(50);
          await lifecycle.frame();
          const pendingMedia =
            replayer.iframe.contentDocument?.querySelector('video');
          if (pendingMedia) {
            replayer.mediaManager.mediaMutation({
              target: pendingMedia,
              timeOffset: 250,
              mutation: {
                type: eventTypes.mediaPlay,
                currentTime: 1,
              },
            });
          }
          replayer.timer.clear();
          replayer.timer.addAction({
            delay: 60_000,
            doAction: () => eventCounts.ownedTimerCallback++,
          });
          replayer.timer.start();
          // Legacy sibling mutations can resolve during the synchronous seek.
          // Seed the same owned retry-map sink so teardown coverage cannot be
          // masked by the fixture's resolution timing.
          replayer.legacy_missingNodeRetryMap[String(95_000 + cycle)] = {
            node: document.createTextNode('owned legacy retry node'),
            mutation: { node: { id: 95_000 + cycle } },
          };
          const beforeDestroy = inspect(replayer);
          const linkBalancesBeforeDestroy = linkProbes.map((probe) => ({
            load: probe.loadBalance,
            error: probe.errorBalance,
            metadata: probe.metadataBalance,
          }));
          const mediaBalancesBeforeDestroy = mediaProbes.map((probe) => ({
            load: probe.loadBalance,
            error: probe.errorBalance,
            metadata: probe.metadataBalance,
          }));
          const rootObserver = new MutationObserver(() => undefined);
          rootObserver.observe(root, { childList: true, subtree: true });
          rootObserver.takeRecords();

          let destroyThrew = false;
          try {
            replayer.destroy();
            replayer.destroy();
          } catch {
            destroyThrew = true;
          }
          rootObserver.takeRecords();
          const countsAtDestroy = { ...eventCounts };
          const afterDestroy = inspect(replayer);
          const resourcesAtDestroy = lifecycle.snapshot();

          for (const probe of [...linkProbes, ...mediaProbes]) {
            probe.node.dispatchEvent(new Event('load'));
            probe.node.dispatchEvent(new Event('error'));
            probe.node.dispatchEvent(new Event('loadedmetadata'));
          }
          replayer.service.send({
            type: 'PLAY',
            payload: { timeOffset: 0 },
          });
          replayer.speedService.send({
            type: 'SET_SPEED',
            payload: { speed: 2 },
          });
          replayer.addEvent({
            type: eventTypes.customEventType,
            data: { tag: 'after-destroy', payload: {} },
            timestamp: readyTimestamp + 10_000,
          });
          await lifecycle.wait(80);
          const postDestroyMutations = rootObserver.takeRecords().length;
          rootObserver.disconnect();
          const afterLateActivity = inspect(replayer);
          const resourcesAfterLateActivity = lifecycle.snapshot();
          const countsAfterLateActivity = { ...eventCounts };
          root.remove();

          const liveRoot = document.createElement('div');
          document.body.appendChild(liveRoot);
          const liveReplayer = new Replayer([], {
            root: liveRoot,
            liveMode: true,
            showWarning: false,
          });
          liveReplayer.startLive();
          const liveTimerBeforeDestroy = liveReplayer.timer.isActive();
          liveReplayer.destroy();
          const liveTimerAfterDestroy = liveReplayer.timer.isActive();
          liveRoot.remove();

          cycles.push({
            cycle,
            forwardSeekIframes,
            beforeDestroy,
            afterDestroy,
            afterLateActivity,
            resourcesAtDestroy,
            resourcesAfterLateActivity,
            linkBalancesBeforeDestroy,
            mediaBalancesBeforeDestroy,
            linkBalances: linkProbes.map((probe) => ({
              load: probe.loadBalance,
              error: probe.errorBalance,
              metadata: probe.metadataBalance,
            })),
            mediaBalances: mediaProbes.map((probe) => ({
              load: probe.loadBalance,
              error: probe.errorBalance,
              metadata: probe.metadataBalance,
            })),
            countsAtDestroy,
            countsAfterLateActivity,
            postDestroyMutations,
            destroyThrew,
            liveTimerBeforeDestroy,
            liveTimerAfterDestroy,
          });
        }
        return { baseline, cycles, final: lifecycle.snapshot() };
      },
      {
        events: lifecycleEvents(),
        readyTimestamp: lifecycleEvents()[0].timestamp + 1_700,
        eventTypes: {
          fullSnapshotRebuilt: ReplayerEvents.FullsnapshotRebuilded,
          destroy: ReplayerEvents.Destroy,
          stateChange: ReplayerEvents.StateChange,
          finish: ReplayerEvents.Finish,
          loadStylesheetEnd: ReplayerEvents.LoadStylesheetEnd,
          eventCast: ReplayerEvents.EventCast,
          customEventType: EventType.Custom,
          mediaPlay: MediaInteractions.Play,
        },
      },
    );

    console.info(
      'rrweb replayer lifecycle census',
      JSON.stringify({
        baseline: results.baseline,
        first: results.cycles[0],
        last: results.cycles[results.cycles.length - 1],
        final: results.final,
      }),
    );
    for (const cycle of results.cycles) {
      expect(
        cycle.forwardSeekIframes,
        `cycle ${cycle.cycle} iframe fixture`,
      ).toBeGreaterThanOrEqual(4);
      expect(cycle.beforeDestroy.timerActive).toBe(true);
      expect(cycle.beforeDestroy.imageMap).toBeGreaterThan(0);
      expect(cycle.beforeDestroy.legacyMissingNodes).toBeGreaterThan(0);
      expect(cycle.beforeDestroy.newDocumentQueue).toBeGreaterThan(0);
      expect(cycle.linkBalancesBeforeDestroy.some(({ load }) => load > 0)).toBe(
        true,
      );
      expect(
        cycle.mediaBalancesBeforeDestroy.some(({ metadata }) => metadata > 0),
      ).toBe(true);
      expect(cycle.liveTimerBeforeDestroy).toBe(true);
      expect(cycle.destroyThrew).toBe(false);
      expect(cycle.countsAtDestroy.destroy).toBe(1);
      expect(cycle.countsAfterLateActivity).toEqual(cycle.countsAtDestroy);
      expect(cycle.postDestroyMutations).toBe(0);
      expect(
        cycle.linkBalances.every(
          ({ load, error, metadata }) =>
            load === 0 && error === 0 && metadata === 0,
        ),
      ).toBe(true);
      expect(
        cycle.mediaBalances.every(
          ({ load, error, metadata }) =>
            load === 0 && error === 0 && metadata === 0,
        ),
      ).toBe(true);
      expect(cycle.afterDestroy).toEqual({
        timerActive: false,
        timerActions: 0,
        serviceStatus: 2,
        speedServiceStatus: 2,
        emitterHandlers: 0,
        imageMap: 0,
        canvasEventMap: 0,
        legacyMissingNodes: 0,
        newDocumentQueue: 0,
        constructedStyleMutations: 0,
        adoptedStyleSheets: 0,
        mediaElements: 0,
        metadataCallbacks: 0,
        mirrorIds: 0,
        wrapperAttached: false,
        nestedIframes: 0,
      });
      expect(cycle.afterLateActivity).toEqual(cycle.afterDestroy);
      expect(cycle.resourcesAtDestroy).toEqual(results.baseline);
      expect(cycle.resourcesAfterLateActivity).toEqual(results.baseline);
      expect(cycle.liveTimerAfterDestroy).toBe(false);
    }
    expect(results.final).toEqual(results.baseline);
  }, 120_000);

  it('contains cleanup and lifecycle-listener exceptions while finishing teardown', async () => {
    const result = await page.evaluate(
      ({ events, destroyEvent, pauseEvent }) => {
        type ReplayerInternals = {
          wrapper: HTMLDivElement;
          timer: { isActive(): boolean };
          service: { status: number };
          speedService: { status: number };
          emitter: { all: Map<string, unknown[]> };
          mediaManager: {
            destroy?: () => void;
            reset(): void;
          };
          imageMap: Map<unknown, unknown>;
          on(event: string, handler: () => void): void;
          play(offset?: number): void;
          destroy(): void;
        };
        const root = document.createElement('div');
        document.body.appendChild(root);
        const Replayer = (
          window as typeof window & {
            rrweb: {
              Replayer: new (
                events: eventWithTime[],
                options: Record<string, unknown>,
              ) => ReplayerInternals;
            };
          }
        ).rrweb.Replayer;
        const replayer = new Replayer(events, { root, showWarning: false });
        replayer.play();
        let destroyEvents = 0;
        replayer.on(pauseEvent, () => {
          throw new Error('expected pause listener cleanup failure');
        });
        replayer.on(destroyEvent, () => {
          destroyEvents++;
          throw new Error('expected destroy listener cleanup failure');
        });
        const mediaMethod = replayer.mediaManager.destroy ? 'destroy' : 'reset';
        replayer.mediaManager[mediaMethod] = () => {
          throw new Error('expected media cleanup failure');
        };
        replayer.imageMap.set('retained-image', new Image());
        let destroyThrew = false;
        try {
          replayer.destroy();
        } catch {
          destroyThrew = true;
        }
        const emitterHandlers = Array.from(
          replayer.emitter.all.values(),
        ).reduce((total, handlers) => total + handlers.length, 0);
        return {
          destroyThrew,
          destroyEvents,
          wrapperAttached: replayer.wrapper.isConnected,
          timerActive: replayer.timer.isActive(),
          serviceStatus: replayer.service.status,
          speedServiceStatus: replayer.speedService.status,
          emitterHandlers,
          imageMap: replayer.imageMap.size,
        };
      },
      {
        events: lifecycleEvents().slice(0, 4),
        destroyEvent: ReplayerEvents.Destroy,
        pauseEvent: ReplayerEvents.Pause,
      },
    );

    expect(result).toEqual({
      destroyThrew: false,
      destroyEvents: 1,
      wrapperAttached: false,
      timerActive: false,
      serviceStatus: 2,
      speedServiceStatus: 2,
      emitterHandlers: 0,
      imageMap: 0,
    });
  });
});
