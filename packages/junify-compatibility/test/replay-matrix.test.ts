import { describe, expect, it } from 'vitest';
import {
  candidateBundle,
  launchCompatibilityBrowser,
} from './browser-test-utils';
import {
  loadRequiredManifest,
  readAndVerifyFixture,
} from './fixture-test-utils';

type ReplayEvent = {
  type?: number;
  timestamp: number;
  data?: {
    tag?: string;
    payload?: { name?: string };
  };
};

function markerOffset(events: ReplayEvent[], name: string): number {
  const marker = events.find(
    (event) =>
      event.type === 5 &&
      event.data?.tag === 'junify-scenario-v1' &&
      event.data.payload?.name === name,
  );
  if (!marker) throw new Error(`replay marker missing: ${name}`);
  return marker.timestamp - events[0].timestamp;
}

async function seekHistoricalFixturesWithCandidate(
  artifacts: Array<{ entry: { id: string }; events: unknown[] }>,
) {
  const browser = await launchCompatibilityBrowser();
  const results: Array<{
    id: string;
    direction: 'forward' | 'backward';
    seekOffset: number;
    seekTime: number;
    currentTime: number;
    visibleText: string | null;
  }> = [];
  try {
    for (const artifact of artifacts) {
      const events = artifact.events as ReplayEvent[];
      const seekOffset = markerOffset(events, 'junify-seek-before-v1');
      const afterOffset = markerOffset(events, 'junify-seek-after-v1');
      for (const direction of ['forward', 'backward'] as const) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<!doctype html><html><body><div id="replay-root"></div></body></html>',
          );
          await page.addScriptTag({ path: candidateBundle });
          const result = await page.evaluate(
            async ({ direction, events, seekOffset, afterOffset }) => {
              type EventShape = { timestamp: number };
              type ReplayerShape = {
                on: (
                  event: string,
                  handler: (event: EventShape) => void,
                ) => void;
                play: (offset?: number) => void;
                pause: (offset?: number) => void;
                destroy: () => void;
                getCurrentTime: () => number;
                iframe?: HTMLIFrameElement;
              };
              const pageWindow = window as typeof window & {
                rrweb: {
                  Replayer: new (
                    events: unknown[],
                    options: Record<string, unknown>,
                  ) => ReplayerShape;
                };
              };
              const root = document.querySelector('#replay-root');
              if (!(root instanceof HTMLElement)) {
                throw new Error('candidate replay root missing');
              }
              const replayer = new pageWindow.rrweb.Replayer(events, {
                root,
                showWarning: false,
                speed: 100,
                useVirtualDom: true,
              });

              if (direction === 'backward') replayer.pause(afterOffset);
              replayer.pause(seekOffset);
              const seekTime = replayer.getCurrentTime();

              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(
                  () =>
                    reject(
                      new Error('candidate replay did not reach seek-after'),
                    ),
                  5_000,
                );
                replayer.on('event-cast', (event) => {
                  if (event.timestamp === events[0].timestamp + afterOffset) {
                    clearTimeout(timeout);
                    replayer.pause();
                    resolve();
                  }
                });
                replayer.play(seekOffset);
              });

              const iframe =
                replayer.iframe ||
                root.querySelector<HTMLIFrameElement>('iframe');
              const visibleText =
                iframe?.contentDocument?.querySelector('#junify-seek-v1')
                  ?.textContent || null;
              const currentTime = replayer.getCurrentTime();
              replayer.destroy();
              return { seekTime, currentTime, visibleText };
            },
            { direction, events, seekOffset, afterOffset },
          );
          results.push({
            id: artifact.entry.id,
            direction,
            seekOffset,
            ...result,
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

describe('junify.compatibility.historical-replay', () => {
  it('replays every accepted historical artifact under official rrweb 2.1.1 in a real browser without skips', async () => {
    const manifest = await loadRequiredManifest();
    const accepted = manifest.fixtures.filter(
      ({ scenario }) => scenario === 'historical-comprehensive-v1',
    );
    expect(accepted).toHaveLength(4);

    const { replayFixturesInRealBrowser } = await import('../src/provenance');
    const artifacts = await Promise.all(
      accepted.map(async (entry) => ({
        entry,
        events: (await readAndVerifyFixture(entry)).events,
      })),
    );
    const results = await replayFixturesInRealBrowser(artifacts);
    expect(results).toEqual(
      accepted.map(({ id }) => ({
        id,
        replayed: true,
        finalDomText: 'junify-seek-after-v1',
        shadowText: 'junify-shadow-mutated-v1',
        canvas2dPixel: [17, 34, 51, 255],
        webglClearColor: [
          0.20000000298023224, 0.4000000059604645, 0.6000000238418579, 1,
        ],
        webglPixel: [51, 102, 153, 255],
        truncatedReplaySinks: {
          spaPushText: 'junify-spa-push-state-v1',
          spaPopText: 'junify-spa-popstate-v1',
          seekBeforeText: 'junify-seek-before-v1',
          seekAfterText: 'junify-seek-after-v1',
          replaceSyncColor: 'rgb(17, 34, 51)',
          replaceAsyncBackground: 'rgb(51, 68, 85)',
          emptyReplacementColor: 'rgb(0, 0, 0)',
          emptyReplacementBackground: 'rgba(0, 0, 0, 0)',
        },
      })),
    );
  });

  it('preserves visible DOM across candidate forward and backward seeks for every historical producer', async () => {
    const manifest = await loadRequiredManifest();
    const accepted = manifest.fixtures.filter(
      ({ scenario }) => scenario === 'historical-comprehensive-v1',
    );
    expect(accepted).toHaveLength(4);
    const artifacts = await Promise.all(
      accepted.map(async (entry) => ({
        entry,
        events: (await readAndVerifyFixture(entry)).events,
      })),
    );

    const results = await seekHistoricalFixturesWithCandidate(artifacts);
    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.seekTime, `${result.id} ${result.direction}`).toBe(
        result.seekOffset,
      );
      expect(
        result.currentTime,
        `${result.id} ${result.direction}`,
      ).toBeGreaterThanOrEqual(result.seekOffset);
      expect(result.visibleText, `${result.id} ${result.direction}`).toBe(
        'junify-seek-after-v1',
      );
    }
  });
});
