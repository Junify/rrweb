import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expectedFixtures,
  loadRequiredManifest,
  packageRoot,
  readAndVerifyFixture,
  type FixtureManifestEntry,
} from './fixture-test-utils';

const authenticatedProducers = {
  'rrweb-alpha4-historical': {
    tarballUrl: 'https://registry.npmjs.org/rrweb/-/rrweb-2.0.0-alpha.4.tgz',
    bundlePath: 'dist/rrweb.js',
    bundleSha256:
      'c21bf15427ffe8b4f9dbcb61ac82b687fc9bce08f7d6a524d127740ecbde1066',
  },
  'junify-alpha19-historical': {
    tarballUrl:
      'https://registry.npmjs.org/@junify-app/rrweb/-/rrweb-2.0.0-alpha.19.tgz',
    bundlePath: 'dist/rrweb.umd.cjs',
    bundleSha256:
      'ad2244657dc41f8adeb80b06bce918309efbb10c607a13ede9752a8496b25c0c',
  },
  'junify-alpha20-historical': {
    tarballUrl:
      'https://registry.npmjs.org/@junify-app/rrweb/-/rrweb-2.0.0-alpha.20.tgz',
    bundlePath: 'dist/rrweb.umd.cjs',
    bundleSha256:
      '49185193bb337af5eefd340456b3ddaf390902acde42e798e58232cdd0d5fac5',
  },
  'rrweb-2.1.1-baseline': {
    tarballUrl: 'https://registry.npmjs.org/rrweb/-/rrweb-2.1.1.tgz',
    bundlePath: 'umd/rrweb.js',
    bundleSha256:
      '427c68951169b301cc4dfda7dfe50a0b4134e9318018c31d6de26e64f1289294',
  },
  'rrweb-2.1.1-large-snapshot': {
    tarballUrl: 'https://registry.npmjs.org/rrweb/-/rrweb-2.1.1.tgz',
    bundlePath: 'umd/rrweb.js',
    bundleSha256:
      '427c68951169b301cc4dfda7dfe50a0b4134e9318018c31d6de26e64f1289294',
  },
} as const;

const regeneratedComprehensiveProducers = [
  'rrweb-alpha4-historical',
  'junify-alpha19-historical',
  'junify-alpha20-historical',
  'rrweb-2.1.1-baseline',
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeProducerEvents(events: unknown[]): unknown[] {
  return events.map((event) => {
    if (typeof event !== 'object' || event === null || Array.isArray(event)) {
      return event;
    }
    const stableEvent = { ...(event as Record<string, unknown>) };
    delete stableEvent.timestamp;
    return stableEvent;
  });
}

function yarnLockEntry(lock: string, key: string): string {
  const start = lock.indexOf(key);
  if (start === -1) throw new Error(`yarn.lock entry missing: ${key}`);
  const end = lock.indexOf('\n\n', start);
  return lock.slice(start, end === -1 ? undefined : end);
}

describe('junify.compatibility producer authentication', () => {
  it('binds each loaded UMD bundle to registry integrity in yarn.lock and the manifest', async () => {
    const manifest = await loadRequiredManifest();
    const lock = await readFile(
      path.join(packageRoot, '..', '..', 'yarn.lock'),
      'utf8',
    );

    for (const [id, authenticated] of Object.entries(authenticatedProducers)) {
      const expected = expectedFixtures[id as keyof typeof expectedFixtures];
      const entry = manifest.fixtures.find((fixture) => fixture.id === id);
      if (!entry) throw new Error(`manifest entry missing: ${id}`);
      const bundle = await readFile(
        path.join(
          packageRoot,
          '..',
          '..',
          'node_modules',
          expected.alias,
          authenticated.bundlePath,
        ),
      );

      expect(sha256(bundle)).toBe(authenticated.bundleSha256);
      expect(entry.producer).toMatchObject({
        registryIntegrity: expected.integrity,
        registryTarball: {
          url: authenticated.tarballUrl,
          integrity: expected.integrity,
        },
        bundle: {
          path: authenticated.bundlePath,
          sha256: authenticated.bundleSha256,
        },
      });
      const lockedProducer = yarnLockEntry(
        lock,
        `"${expected.alias}@${authenticated.tarballUrl}":`,
      );
      expect(lockedProducer).toContain(`  version "${expected.version}"`);
      expect(lockedProducer).toContain(
        `  resolved "${authenticated.tarballUrl}#`,
      );
      expect(lockedProducer).toContain(`  integrity ${expected.integrity}`);
    }
  });

  it('collects fresh real-browser artifacts into temporary storage that normalize to the committed producer output', async () => {
    const manifest = await loadRequiredManifest();
    const provenance = (await import(
      '../src/provenance'
    )) as typeof import('../src/provenance') & {
      collectFixtureInto?: (
        id: FixtureManifestEntry['id'],
        outputRoot: string,
      ) => Promise<FixtureManifestEntry>;
    };
    if (typeof provenance.collectFixtureInto !== 'function') {
      throw new Error('collectFixtureInto is not implemented');
    }

    const outputRoot = await mkdtemp(
      path.join(tmpdir(), 'junify-rrweb-regeneration-'),
    );
    try {
      for (const id of regeneratedComprehensiveProducers) {
        const committed = manifest.fixtures.find(
          (fixture) => fixture.id === id,
        );
        if (!committed) throw new Error(`committed fixture missing: ${id}`);
        const collected = await provenance.collectFixtureInto(id, outputRoot);
        const committedEvents = (await readAndVerifyFixture(committed)).events;
        const generatedGzip = await readFile(
          path.join(outputRoot, collected.file),
        );
        const { gunzipSync } = await import('node:zlib');
        const generatedEvents = JSON.parse(
          gunzipSync(generatedGzip).toString('utf8'),
        ) as unknown[];

        expect(normalizeProducerEvents(generatedEvents)).toEqual(
          normalizeProducerEvents(committedEvents),
        );
        expect(collected.fullSnapshotPayloadSha256).toEqual(
          committed.fullSnapshotPayloadSha256,
        );
        expect(collected.scenarioCoverage).toEqual(committed.scenarioCoverage);
      }
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
