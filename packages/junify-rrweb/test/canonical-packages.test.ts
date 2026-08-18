import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readJson, repositoryRoot } from './package-test-utils';

interface ArtifactIdentity {
  bytes: number;
  file: string;
  regularFileCount: number;
  sha256: string;
  sha512: string;
  sha512Integrity: string;
  treeDigestSha256: string;
}

interface CanonicalPackageManifest {
  pipeline: {
    nodeEnv: string;
    npmPackArguments: string[];
    runs: number;
  };
  packages: Record<
    'core' | 'player',
    {
      artifact: ArtifactIdentity;
      deterministicRuns: ArtifactIdentity[];
      entrypoints: Record<string, string[]>;
      name: string;
      version: string;
    }
  >;
}

function hash(filename: string, algorithm: 'sha256' | 'sha512'): string {
  return createHash(algorithm).update(readFileSync(filename)).digest('hex');
}

function extractedTreeIdentity(
  artifactPath: string,
  temporaryDirectory: string,
): Pick<ArtifactIdentity, 'regularFileCount' | 'treeDigestSha256'> {
  const extractedDirectory = path.join(temporaryDirectory, 'extracted');
  mkdirSync(extractedDirectory, { recursive: true });
  const extraction = spawnSync(
    'tar',
    ['-xzf', artifactPath, '-C', extractedDirectory],
    { encoding: 'utf8' },
  );
  if (extraction.status !== 0) {
    throw new Error(`${extraction.stdout}${extraction.stderr}`);
  }

  const packageDirectory = path.join(extractedDirectory, 'package');
  const relativeFiles: string[] = [];
  const visit = (relativeDirectory: string): void => {
    for (const entry of readdirSync(
      path.join(packageDirectory, relativeDirectory),
      { withFileTypes: true },
    )) {
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) relativeFiles.push(relativePath);
      else throw new Error(`Unexpected packed tree member: ${relativePath}`);
    }
  };
  visit('');

  const census = relativeFiles.sort().map((relativePath) => {
    const filename = path.join(packageDirectory, relativePath);
    return `${hash(filename, 'sha256')}  ${
      statSync(filename).size
    }  ${relativePath}`;
  });
  return {
    regularFileCount: relativeFiles.length,
    treeDigestSha256: createHash('sha256')
      .update(`${census.join('\n')}\n`)
      .digest('hex'),
  };
}

describe('canonical Junify boundary package pipeline', () => {
  test('fails closed on archive drift even when the unpacked tree matches', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-pack-verifier-'),
    );
    try {
      const summariesPath = path.join(temporaryDirectory, 'summaries.json');
      writeFileSync(
        summariesPath,
        `${JSON.stringify(
          [
            {
              file: 'candidate.tgz',
              bytes: 10,
              sha256: 'a'.repeat(64),
              sha512: 'b'.repeat(128),
              sha512Integrity: 'sha512-first',
              regularFileCount: 18,
              treeDigestSha256: 'c'.repeat(64),
            },
            {
              file: 'candidate.tgz',
              bytes: 10,
              sha256: 'd'.repeat(64),
              sha512: 'e'.repeat(128),
              sha512Integrity: 'sha512-second',
              regularFileCount: 18,
              treeDigestSha256: 'c'.repeat(64),
            },
          ],
          null,
          2,
        )}\n`,
      );
      const result = spawnSync(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            'packages/junify-rrweb/scripts/canonical-packages.mjs',
          ),
          '--verify-run-summaries',
          summariesPath,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /non-deterministic archive bytes/i,
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('repeats clean production builds with byte-identical core and player archives', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-canonical-pack-'),
    );
    const outputDirectory = path.join(temporaryDirectory, 'output');
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            'packages/junify-rrweb/scripts/canonical-packages.mjs',
          ),
          '--output',
          outputDirectory,
          '--runs',
          '2',
        ],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          env: { ...process.env, NODE_ENV: 'test' },
          timeout: 180_000,
        },
      );
      if (result.status !== 0) {
        throw new Error(`${result.stdout}${result.stderr}`);
      }

      const manifest = readJson<CanonicalPackageManifest>(
        path.join(outputDirectory, 'combined-manifest.json'),
      );
      expect(manifest.pipeline).toEqual({
        nodeEnv: 'production',
        npmPackArguments: ['--ignore-scripts', '--json'],
        runs: 2,
      });

      for (const [role, expected] of [
        [
          'core',
          {
            file: 'junify-app-rrweb-2.1.1-junify.0.tgz',
            name: '@junify-app/rrweb',
            regularFileCount: 19,
          },
        ],
        [
          'player',
          {
            file: 'junify-app-rrweb-player-2.1.1-junify.0.tgz',
            name: '@junify-app/rrweb-player',
            regularFileCount: 18,
          },
        ],
      ] as const) {
        const packageManifest = manifest.packages[role];
        expect(packageManifest).toMatchObject({
          name: expected.name,
          version: '2.1.1-junify.0',
          artifact: {
            file: expected.file,
            regularFileCount: expected.regularFileCount,
          },
        });
        expect(packageManifest.deterministicRuns).toHaveLength(2);
        expect(packageManifest.deterministicRuns[1]).toEqual(
          packageManifest.deterministicRuns[0],
        );
        expect(packageManifest.artifact).toEqual(
          packageManifest.deterministicRuns[0],
        );

        const artifactPath = path.join(outputDirectory, expected.file);
        const artifactContents = readFileSync(artifactPath);
        const independentlyObserved = {
          bytes: artifactContents.byteLength,
          sha256: hash(artifactPath, 'sha256'),
          sha512: hash(artifactPath, 'sha512'),
          sha512Integrity: `sha512-${createHash('sha512')
            .update(artifactContents)
            .digest('base64')}`,
          ...extractedTreeIdentity(
            artifactPath,
            path.join(temporaryDirectory, role),
          ),
        };
        expect(packageManifest.artifact).toMatchObject(independentlyObserved);
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
