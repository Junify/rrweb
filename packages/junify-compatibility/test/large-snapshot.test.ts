import { describe, expect, it } from 'vitest';
import {
  loadRequiredManifest,
  readAndVerifyFixture,
  sha256,
} from './fixture-test-utils';

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
});
