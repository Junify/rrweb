import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

function malformedLegacyArtifacts() {
  const startTime = 1_700_000_100_000;
  const baseSnapshot = [
    {
      type: 4,
      data: { href: 'about:blank', width: 800, height: 600 },
      timestamp: startTime,
    },
    {
      type: 2,
      data: {
        node: {
          id: 1,
          type: 0,
          childNodes: [
            {
              id: 2,
              type: 1,
              name: 'html',
              publicId: '',
              systemId: '',
            },
            {
              id: 3,
              type: 2,
              tagName: 'html',
              attributes: {},
              childNodes: [
                {
                  id: 4,
                  type: 2,
                  tagName: 'head',
                  attributes: {},
                  childNodes: [
                    {
                      id: 5,
                      type: 2,
                      tagName: 'style',
                      attributes: {},
                      childNodes: [],
                    },
                  ],
                },
                {
                  id: 6,
                  type: 2,
                  tagName: 'body',
                  attributes: {},
                  childNodes: [
                    {
                      id: 7,
                      type: 3,
                      textContent: 'legacy text target',
                    },
                    {
                      id: 8,
                      type: 2,
                      tagName: 'video',
                      attributes: {},
                      childNodes: [],
                    },
                    {
                      id: 9,
                      type: 2,
                      tagName: 'div',
                      attributes: { class: 'valid-style-target' },
                      childNodes: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        initialOffset: { top: 0, left: 0 },
      },
      timestamp: startTime + 10,
    },
  ];
  return {
    media: [
      ...baseSnapshot,
      {
        type: 3,
        data: { source: 7, type: 0, id: 7, currentTime: 1.5 },
        timestamp: startTime + 20,
      },
      {
        type: 3,
        data: {
          source: 7,
          type: 1,
          id: 8,
          currentTime: 4.25,
          volume: 0.5,
          muted: true,
          playbackRate: 1,
        },
        timestamp: startTime + 30,
      },
    ],
    style: [
      ...baseSnapshot,
      {
        type: 3,
        data: {
          source: 0,
          adds: [],
          removes: [],
          texts: [{ id: 7, value: 'activates virtual DOM' }],
          attributes: [],
        },
        timestamp: startTime + 20,
      },
      {
        type: 3,
        data: {
          source: 8,
          id: 9,
          adds: [{ rule: '.ignored-malformed-rule { color: red; }', index: 0 }],
        },
        timestamp: startTime + 30,
      },
      {
        type: 3,
        data: {
          source: 8,
          id: 5,
          adds: [
            {
              rule: '.valid-style-target { color: rgb(17, 34, 51); }',
              index: 0,
            },
          ],
        },
        timestamp: startTime + 40,
      },
    ],
  };
}

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
  it('replays persisted malformed legacy media and style events without dropping following valid events', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'junify-legacy-replay-'),
    );
    const artifactPath = path.join(
      temporaryDirectory,
      'malformed-legacy.events.json',
    );
    const browser = await launchCompatibilityBrowser();
    try {
      await writeFile(
        artifactPath,
        JSON.stringify(malformedLegacyArtifacts()),
        'utf8',
      );
      const persisted = JSON.parse(
        await readFile(artifactPath, 'utf8'),
      ) as ReturnType<typeof malformedLegacyArtifacts>;
      const page = await browser.newPage();
      try {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: candidateBundle });
        const result = await page.evaluate((artifacts) => {
          type ReplayerShape = {
            iframe: HTMLIFrameElement;
            service: { send(event: unknown): void };
            pause(offset?: number): void;
            destroy(): void;
          };
          const Replayer = (
            window as typeof window & {
              rrweb: {
                Replayer: new (
                  events: unknown[],
                  options: Record<string, unknown>,
                ) => ReplayerShape;
              };
            }
          ).rrweb.Replayer;

          let mediaThrew = false;
          const media = new Replayer(artifacts.media, {
            showWarning: false,
          });
          try {
            media.pause(40);
          } catch {
            mediaThrew = true;
          }
          const video = media.iframe.contentDocument?.querySelector('video');
          const mediaSink = {
            mediaThrew,
            currentTime: video?.currentTime,
            volume: video?.volume,
            muted: video?.muted,
          };
          media.destroy();

          let styleThrew = false;
          const style = new Replayer(artifacts.style, {
            showWarning: false,
            useVirtualDom: true,
          });
          try {
            style.service.send({ type: 'PLAY', payload: { timeOffset: 50 } });
            style.service.send({ type: 'PAUSE' });
          } catch {
            styleThrew = true;
          }
          const target = style.iframe.contentDocument?.querySelector(
            '.valid-style-target',
          );
          const styleSink = {
            styleThrew,
            color: target
              ? style.iframe.contentWindow?.getComputedStyle(target).color
              : null,
          };
          style.destroy();
          return { mediaSink, styleSink };
        }, persisted);

        expect(result).toEqual({
          mediaSink: {
            mediaThrew: false,
            currentTime: 4.25,
            volume: 0.5,
            muted: true,
          },
          styleSink: {
            styleThrew: false,
            color: 'rgb(17, 34, 51)',
          },
        });
      } finally {
        await page.close();
      }
    } finally {
      await browser.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

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
