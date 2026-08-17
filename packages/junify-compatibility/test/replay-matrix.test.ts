import { describe, expect, it } from 'vitest';
import {
  loadRequiredManifest,
  readAndVerifyFixture,
} from './fixture-test-utils';

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
      })),
    );
  });
});
