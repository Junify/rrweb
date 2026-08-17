import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const fixturesRoot = path.join(packageRoot, 'fixtures');

export const expectedFixtures = {
  'rrweb-alpha4-historical': {
    package: 'rrweb',
    alias: 'rrweb-alpha4',
    version: '2.0.0-alpha.4',
    integrity:
      'sha512-wEHUILbxDPcNwkM3m4qgPgXAiBJyqCbbOHyVoNEVBJzHszWEFYyTbrZqUdeb1EfmTRC2PsumCIkVcomJ/xcOzA==',
    scenario: 'historical-comprehensive-v1',
  },
  'junify-alpha19-historical': {
    package: '@junify-app/rrweb',
    alias: 'junify-rrweb-alpha19',
    version: '2.0.0-alpha.19',
    integrity:
      'sha512-0kpxuWenvwwzp1+bhLPlWBKHGHQkXwwRAzCxoBQcD4y9ph4REknQHLF5CJNjtfNfzZUcI9KRT6ILD3jGXgbNsg==',
    scenario: 'historical-comprehensive-v1',
  },
  'junify-alpha20-historical': {
    package: '@junify-app/rrweb',
    alias: 'junify-rrweb-alpha20',
    version: '2.0.0-alpha.20',
    integrity:
      'sha512-oLI31EWkGhcT+MMfxo2QvMFFeP3vpSYslYvF5YX2KV1qTfKGOQZ924ycr8HILkgx244l6LzX0LCUtKQqWCK0qQ==',
    scenario: 'historical-comprehensive-v1',
  },
  'rrweb-2.1.1-baseline': {
    package: 'rrweb',
    alias: 'rrweb-stable211',
    version: '2.1.1',
    integrity:
      'sha512-ToxhJg3SsrAhw+/DPhI/2iiwZQIrGK5BGkZ0kHn4qUExcvQYRaolkciD1FWX2+r6vf1IxFyhsoRY18h3D+XoCg==',
    scenario: 'historical-comprehensive-v1',
  },
  'rrweb-2.1.1-large-snapshot': {
    package: 'rrweb',
    alias: 'rrweb-stable211',
    version: '2.1.1',
    integrity:
      'sha512-ToxhJg3SsrAhw+/DPhI/2iiwZQIrGK5BGkZ0kHn4qUExcvQYRaolkciD1FWX2+r6vf1IxFyhsoRY18h3D+XoCg==',
    scenario: 'large-css-full-snapshot-v1',
  },
} as const;

export interface FixtureManifestEntry {
  id: keyof typeof expectedFixtures;
  file: string;
  producer: {
    package: string;
    alias: string;
    version: string;
    registryIntegrity: string;
  };
  scenario: string;
  browser: {
    name: string;
    version: string;
    userAgent: string;
  };
  createdAt: string;
  creationCommand: string;
  raw: { bytes: number; sha256: string };
  gzip: { bytes: number; sha256: string };
  eventCount: number;
  fullSnapshotIndexes: number[];
  fullSnapshotPayloadSha256: string[];
  privacyScan: {
    passed: boolean;
    sentinelOccurrences: Record<string, number>;
    leakedSentinels: string[];
    scanSha256: string;
  };
  scenarioCoverage: Record<
    string,
    { observed: boolean; eventIndexes: number[] }
  >;
  largeSnapshot?: {
    rawCssBytes: number;
    cssSha256: string;
    fullSnapshotCssSha256: string;
  };
}

export interface FixtureManifest {
  schemaVersion: number;
  scenarioVersion: string;
  fixtures: FixtureManifestEntry[];
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function loadRequiredManifest(): Promise<FixtureManifest> {
  const manifest = JSON.parse(
    await readFile(path.join(fixturesRoot, 'manifest.json'), 'utf8'),
  ) as FixtureManifest;
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.scenarioVersion).toBe('historical-comprehensive-v1');
  expect(manifest.fixtures.map(({ id }) => id).sort()).toEqual(
    Object.keys(expectedFixtures).sort(),
  );
  return manifest;
}

export async function readAndVerifyFixture(entry: FixtureManifestEntry) {
  const gzip = await readFile(path.join(fixturesRoot, entry.file));
  expect(gzip.byteLength).toBe(entry.gzip.bytes);
  expect(sha256(gzip)).toBe(entry.gzip.sha256);
  const raw = gunzipSync(gzip);
  expect(raw.byteLength).toBe(entry.raw.bytes);
  expect(sha256(raw)).toBe(entry.raw.sha256);
  const events = JSON.parse(raw.toString('utf8')) as unknown[];
  expect(events).toHaveLength(entry.eventCount);
  return { gzip, raw, events };
}
