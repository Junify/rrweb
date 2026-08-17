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
  it('locks authentic producer, browser, command, hashes, indexes, and scenario provenance', async () => {
    const manifest = await loadRequiredManifest();
    const { inspectScenarioCoverage, privacySentinels } = await import(
      '../src/scenarios'
    );

    for (const entry of manifest.fixtures) {
      const expected = expectedFixtures[entry.id];
      expect(entry.producer).toEqual({
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
});
