import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expectedFixtures,
  loadRequiredManifest,
  packageRoot,
  readAndVerifyFixture,
  sha256,
} from './fixture-test-utils';

describe('junify.compatibility.wire-format historical producer fixtures', () => {
  it('locks producer, browser, command, hashes, indexes, and scenario provenance', async () => {
    const manifest = await loadRequiredManifest();
    const { inspectScenarioCoverage, privacySentinels } = await import(
      '../src/scenarios'
    );

    for (const entry of manifest.fixtures) {
      const expected = expectedFixtures[entry.id];
      expect(entry.producer).toMatchObject({
        package: expected.package,
        alias: expected.alias,
        version: expected.version,
        registryIntegrity: expected.integrity,
      });
      const installedPackage = JSON.parse(
        await readFile(
          path.join(
            packageRoot,
            '..',
            '..',
            'node_modules',
            expected.alias,
            'package.json',
          ),
          'utf8',
        ),
      ) as { name: string; version: string };
      expect(installedPackage).toMatchObject({
        name: expected.package,
        version: expected.version,
      });
      expect(entry.scenario).toBe(expected.scenario);
      expect(entry.browser.name).toBe('Google Chrome');
      expect(entry.browser.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(entry.browser.userAgent).toContain('Chrome/');
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
      expect(entry.creationCommand).toBe(
        `PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer ${entry.id}`,
      );

      const { raw, events } = await readAndVerifyFixture(entry);
      const fullSnapshotIndexes = events.flatMap((event, index) =>
        (event as { type?: number }).type === 2 ? [index] : [],
      );
      expect(entry.fullSnapshotIndexes).toEqual(fullSnapshotIndexes);
      expect(entry.fullSnapshotPayloadSha256).toEqual(
        fullSnapshotIndexes.map((index) =>
          sha256(JSON.stringify((events[index] as { data: unknown }).data)),
        ),
      );
      expect(entry.scenarioCoverage).toEqual(
        inspectScenarioCoverage(events, entry.scenario),
      );
      expect(
        Object.values(entry.scenarioCoverage).every((item) => item.observed),
      ).toBe(true);

      const rawText = raw.toString('utf8');
      const sentinelOccurrences = Object.fromEntries(
        Object.entries(privacySentinels).map(([name, sentinel]) => [
          name,
          rawText.split(sentinel).length - 1,
        ]),
      );
      const leakedSentinels = Object.entries(sentinelOccurrences)
        .filter(([, occurrences]) => occurrences > 0)
        .map(([name]) => name);
      expect(entry.privacyScan.sentinelOccurrences).toEqual(
        sentinelOccurrences,
      );
      expect(entry.privacyScan.leakedSentinels).toEqual(leakedSentinels);
      expect(entry.privacyScan.passed).toBe(leakedSentinels.length === 0);
      expect(entry.privacyScan.scanSha256).toBe(
        sha256(JSON.stringify(sentinelOccurrences)),
      );
    }
  });

  it('rejects marker-only SPA and seek evidence when serialized target mutations are removed', async () => {
    const manifest = await loadRequiredManifest();
    const entry = manifest.fixtures.find(
      ({ id }) => id === 'rrweb-2.1.1-baseline',
    );
    if (!entry) throw new Error('stable baseline fixture missing');
    const { events } = await readAndVerifyFixture(entry);
    const mutationValues = new Set([
      'junify-spa-push-state-v1',
      'junify-spa-popstate-v1',
      'junify-seek-before-v1',
      'junify-seek-after-v1',
    ]);
    const withoutTargetMutations = structuredClone(events) as Array<{
      type?: number;
      data?: {
        source?: number;
        texts?: Array<{ value?: string }>;
        adds?: Array<{ node?: { textContent?: string } }>;
      };
    }>;
    for (const event of withoutTargetMutations) {
      if (event.type !== 3 || event.data?.source !== 0) continue;
      event.data.texts = event.data.texts?.filter(
        ({ value }) => !value || !mutationValues.has(value),
      );
      event.data.adds = event.data.adds?.filter(
        ({ node }) =>
          !node?.textContent || !mutationValues.has(node.textContent),
      );
    }
    const serialized = JSON.stringify(withoutTargetMutations);
    expect(serialized).toContain('junify-spa-push-state-v1');
    expect(serialized).toContain('junify-seek-before-v1');

    const { inspectScenarioCoverage } = await import('../src/scenarios');
    const coverage = inspectScenarioCoverage(
      withoutTargetMutations,
      entry.scenario,
    );
    expect(coverage.spaPushState.observed).toBe(false);
    expect(coverage.spaPopstate.observed).toBe(false);
    expect(coverage.seekReadyMutations.observed).toBe(false);
  });
});
