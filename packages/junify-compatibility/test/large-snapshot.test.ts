import { describe, expect, it } from 'vitest';
import {
  loadRequiredManifest,
  readAndVerifyFixture,
  sha256,
} from './fixture-test-utils';
import {
  candidateBundle,
  launchCompatibilityBrowser,
  officialStableBundle,
} from './browser-test-utils';

describe('junify.compatibility.large-snapshot', () => {
  it('locks the approximately 13.6 MB CSS FullSnapshot event/index/payload and gzip round trip', async () => {
    const manifest = await loadRequiredManifest();
    const entry = manifest.fixtures.find(
      ({ id }) => id === 'rrweb-2.1.1-large-snapshot',
    );
    if (!entry) throw new Error('large snapshot manifest entry missing');
    const { events } = await readAndVerifyFixture(entry);
    const { extractLargeSnapshotCss } = await import('../src/scenarios');
    const css = extractLargeSnapshotCss(events);

    expect(Buffer.byteLength(css)).toBe(13_600_000);
    expect(entry.largeSnapshot).toEqual({
      rawCssBytes: 13_600_000,
      cssSha256: sha256(css),
      fullSnapshotCssSha256: sha256(css),
    });
    expect(entry.eventCount).toBe(events.length);
    expect(entry.fullSnapshotIndexes).toEqual([1]);
    expect(entry.fullSnapshotPayloadSha256).toEqual([
      sha256(JSON.stringify((events[1] as { data: unknown }).data)),
    ]);
  });

  it('rebuilds the approximately 13.6 MB FullSnapshot after a candidate seek and records the stable differential timing', async () => {
    const manifest = await loadRequiredManifest();
    const entry = manifest.fixtures.find(
      ({ id }) => id === 'rrweb-2.1.1-large-snapshot',
    );
    if (!entry) throw new Error('large snapshot manifest entry missing');
    const { events } = await readAndVerifyFixture(entry);
    const { extractLargeSnapshotCss } = await import('../src/scenarios');
    const expectedRuleCount =
      extractLargeSnapshotCss(events).split(':root').length - 1;
    const typedEvents = events as Array<{ timestamp: number }>;
    const seekOffset =
      typedEvents[typedEvents.length - 1].timestamp -
      typedEvents[0].timestamp +
      1;
    const browser = await launchCompatibilityBrowser();
    const timings: Record<string, number> = {};
    try {
      for (const [name, bundle] of [
        ['official-2.1.1', officialStableBundle],
        ['candidate', candidateBundle],
      ] as const) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<!doctype html><html><body><div id="replay-root"></div></body></html>',
          );
          await page.addScriptTag({ path: bundle });
          const result = await page.evaluate(
            ({ events, seekOffset }) => {
              type ReplayerShape = {
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
                throw new Error('large snapshot replay root missing');
              }
              const replayer = new pageWindow.rrweb.Replayer(events, {
                root,
                showWarning: false,
                useVirtualDom: true,
              });
              const startedAt = performance.now();
              replayer.pause(seekOffset);
              const elapsedMs = performance.now() - startedAt;
              const iframe =
                replayer.iframe ||
                root.querySelector<HTMLIFrameElement>('iframe');
              const replayDocument = iframe?.contentDocument;
              const style = replayDocument?.querySelector<HTMLStyleElement>(
                '#junify-large-style-v1',
              );
              const result = {
                elapsedMs,
                currentTime: replayer.getCurrentTime(),
                styleRuleCount: style?.sheet?.cssRules.length || 0,
                markerText:
                  replayDocument?.querySelector('#junify-large-css-v1')
                    ?.textContent || null,
              };
              replayer.destroy();
              return result;
            },
            { events, seekOffset },
          );

          expect(result.currentTime, name).toBe(seekOffset);
          expect(result.styleRuleCount, name).toBe(expectedRuleCount);
          expect(result.markerText, name).toBe('large snapshot');
          expect(Number.isFinite(result.elapsedMs), name).toBe(true);
          expect(result.elapsedMs, name).toBeGreaterThan(0);
          expect(result.elapsedMs, name).toBeLessThan(30_000);
          timings[name] = result.elapsedMs;
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    console.info(
      `13.6 MB explicit-seek timing: ${JSON.stringify({
        ...timings,
        candidateToOfficialRatio: timings.candidate / timings['official-2.1.1'],
      })}`,
    );
  });
});
