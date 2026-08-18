import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
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
  source: {
    endHead: string;
    rrwebCommit: string;
    startHead: string;
    validationStages: Array<{
      generatedResidues: string[];
      head: string;
      stage: string;
      worktreeClean: boolean;
    }>;
    worktreeClean: boolean;
  };
  pipeline: {
    nodeEnv: string;
    npmPackArguments: string[];
    npmPackInvocationsPerRun: number;
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

interface CommandObservation {
  args: string[];
  executable: string;
  stdout: string;
}

const canonicalPackagesScript = path.join(
  repositoryRoot,
  'packages/junify-rrweb/scripts/canonical-packages.mjs',
);

function realExecutable(command: string): string {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function createNpmObserver(temporaryDirectory: string): {
  binDirectory: string;
  logPath: string;
} {
  const binDirectory = path.join(temporaryDirectory, 'observed-bin');
  const logPath = path.join(temporaryDirectory, 'npm-observations.jsonl');
  mkdirSync(binDirectory);
  const wrapperPath = path.join(binDirectory, 'npm');
  writeFileSync(
    wrapperPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const result = spawnSync(process.env.JUNIFY_REAL_NPM, args, {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
appendFileSync(process.env.JUNIFY_NPM_OBSERVATIONS, JSON.stringify({
  executable: process.argv[1],
  args,
  stdout: result.stdout,
}) + '\\n');
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status === null ? 1 : result.status);
`,
  );
  chmodSync(wrapperPath, 0o755);
  return { binDirectory, logPath };
}

function createGitObserver(temporaryDirectory: string): {
  binDirectory: string;
  logPath: string;
} {
  const binDirectory = path.join(temporaryDirectory, 'observed-git-bin');
  const logPath = path.join(temporaryDirectory, 'git-observations.jsonl');
  const counterPath = path.join(temporaryDirectory, 'git-head-count');
  mkdirSync(binDirectory);
  const wrapperPath = path.join(binDirectory, 'git');
  writeFileSync(
    wrapperPath,
    `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
appendFileSync(process.env.JUNIFY_GIT_OBSERVATIONS, JSON.stringify({
  executable: process.argv[1],
  args,
}) + '\\n');
if (args.join(' ') === 'rev-parse HEAD') {
  const count = existsSync(process.env.JUNIFY_GIT_HEAD_COUNTER)
    ? Number(readFileSync(process.env.JUNIFY_GIT_HEAD_COUNTER, 'utf8'))
    : 0;
  writeFileSync(process.env.JUNIFY_GIT_HEAD_COUNTER, String(count + 1));
  const changed = process.env.JUNIFY_CHANGE_HEAD === '1' && count > 0;
  process.stdout.write(changed ? 'ffffffffffffffffffffffffffffffffffffffff\\n' : process.env.JUNIFY_EXPECTED_HEAD + '\\n');
  process.exit(0);
}
if (args[0] === 'status') process.exit(0);
const result = spawnSync(process.env.JUNIFY_REAL_GIT, args, { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
`,
  );
  chmodSync(wrapperPath, 0o755);
  writeFileSync(counterPath, '0');
  return { binDirectory, logPath };
}

function createFakePackagingCommands(temporaryDirectory: string): string {
  const binDirectory = path.join(temporaryDirectory, 'fake-packaging-bin');
  mkdirSync(binDirectory);
  const npmPath = path.join(binDirectory, 'npm');
  writeFileSync(
    npmPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('10.1.0\\n');
  process.exit(0);
}
if (args[0] === 'pack') {
  process.stdout.write(process.env.JUNIFY_FAKE_PACK_RESULTS + '\\n');
  process.exit(0);
}
process.exit(2);
`,
  );
  chmodSync(npmPath, 0o755);
  const yarnPath = path.join(binDirectory, 'yarn');
  writeFileSync(
    yarnPath,
    `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') === '--version') {
  process.stdout.write('1.23.0-20220130.1630\\n');
}
process.exit(0);
`,
  );
  chmodSync(yarnPath, 0o755);
  return binDirectory;
}

function readObservations<T>(filename: string): T[] {
  if (!existsSync(filename)) return [];
  return readFileSync(filename, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
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

  test('rejects dirty tracked source and retained boundary build residue before changing outputs', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-source-preflight-'),
    );
    const outputDirectory = path.join(temporaryDirectory, 'output');
    const trackedPath = path.join(
      repositoryRoot,
      'packages/junify-rrweb/README.md',
    );
    const trackedContents = readFileSync(trackedPath);
    const residuePaths = [
      'packages/junify-rrweb/.round4-probe.svelte.d.ts',
      'packages/junify-rrweb/tsconfig.tsbuildinfo',
      'packages/junify-rrweb-player/.round4-probe.svelte.d.ts',
      'packages/junify-rrweb-player/tsconfig.tsbuildinfo',
      'packages/junify-rrweb-player/types/retained.d.ts',
    ];
    expect(
      residuePaths.filter((relativePath) =>
        existsSync(path.join(repositoryRoot, relativePath)),
      ),
    ).toEqual([]);
    let result: ReturnType<typeof spawnSync>;
    let residuesRetainedAfterRejection: boolean[] = [];
    try {
      appendFileSync(trackedPath, '\nround4-dirty-source-probe\n');
      for (const relativePath of residuePaths) {
        const filename = path.join(repositoryRoot, relativePath);
        mkdirSync(path.dirname(filename), { recursive: true });
        writeFileSync(filename, 'round4-generated-residue-probe\n');
      }
      result = spawnSync(
        process.execPath,
        [canonicalPackagesScript, '--output', outputDirectory, '--runs', '2'],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          timeout: 180_000,
        },
      );
      residuesRetainedAfterRejection = residuePaths.map((relativePath) =>
        existsSync(path.join(repositoryRoot, relativePath)),
      );
    } finally {
      writeFileSync(trackedPath, trackedContents);
      for (const relativePath of residuePaths) {
        rmSync(path.join(repositoryRoot, relativePath), { force: true });
      }
      const typesDirectory = path.join(
        repositoryRoot,
        'packages/junify-rrweb-player/types',
      );
      if (
        existsSync(typesDirectory) &&
        readdirSync(typesDirectory).length === 0
      ) {
        rmdirSync(typesDirectory);
      }
    }

    const output = `${String(result.stdout)}${String(result.stderr)}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/source state is not clean before build/i);
    expect(output).toContain('packages/junify-rrweb/README.md');
    for (const relativePath of residuePaths)
      expect(output).toContain(relativePath);
    expect(residuesRetainedAfterRejection).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(existsSync(outputDirectory)).toBe(false);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }, 180_000);

  test('rejects a HEAD change between preflight and the first build stage', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-source-head-drift-'),
    );
    const outputDirectory = path.join(temporaryDirectory, 'output');
    const expectedHead = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).stdout.trim();
    const gitObserver = createGitObserver(temporaryDirectory);
    try {
      const result = spawnSync(
        process.execPath,
        [canonicalPackagesScript, '--output', outputDirectory, '--runs', '2'],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${gitObserver.binDirectory}:${process.env.PATH ?? ''}`,
            JUNIFY_REAL_GIT: realExecutable('git'),
            JUNIFY_GIT_OBSERVATIONS: gitObserver.logPath,
            JUNIFY_GIT_HEAD_COUNTER: path.join(
              temporaryDirectory,
              'git-head-count',
            ),
            JUNIFY_EXPECTED_HEAD: expectedHead,
            JUNIFY_CHANGE_HEAD: '1',
          },
          timeout: 180_000,
        },
      );
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).not.toBe(0);
      expect(output).toMatch(/source HEAD changed/i);
      expect(readObservations(gitObserver.logPath)).toHaveLength(3);
      expect(
        existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0,
      ).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);

  test('rejects missing, extra, duplicate, and mismatched shared npm results before emission', () => {
    const expectedHead = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).stdout.trim();
    const core = {
      filename: 'junify-app-rrweb-2.1.1-junify.0.tgz',
      name: '@junify-app/rrweb',
      version: '2.1.1-junify.0',
    };
    const player = {
      filename: 'junify-app-rrweb-player-2.1.1-junify.0.tgz',
      name: '@junify-app/rrweb-player',
      version: '2.1.1-junify.0',
    };
    const cases = [
      {
        name: 'missing',
        results: [core],
        error: /expected exactly two npm pack results/i,
      },
      {
        name: 'extra',
        results: [core, player, { ...player, name: 'unexpected-package' }],
        error: /expected exactly two npm pack results/i,
      },
      {
        name: 'duplicate',
        results: [core, core],
        error: /duplicate npm pack result for core/i,
      },
      {
        name: 'wrong-filename',
        results: [core, { ...player, filename: 'wrong-player.tgz' }],
        error: /unexpected npm pack result/i,
      },
    ];

    for (const testCase of cases) {
      const temporaryDirectory = mkdtempSync(
        path.join(tmpdir(), `junify-pack-results-${testCase.name}-`),
      );
      const outputDirectory = path.join(temporaryDirectory, 'output');
      const gitObserver = createGitObserver(temporaryDirectory);
      const fakePackagingBin = createFakePackagingCommands(temporaryDirectory);
      try {
        const result = spawnSync(
          process.execPath,
          [canonicalPackagesScript, '--output', outputDirectory, '--runs', '2'],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${fakePackagingBin}:${gitObserver.binDirectory}:${
                process.env.PATH ?? ''
              }`,
              JUNIFY_FAKE_PACK_RESULTS: JSON.stringify(testCase.results),
              JUNIFY_REAL_GIT: realExecutable('git'),
              JUNIFY_GIT_OBSERVATIONS: gitObserver.logPath,
              JUNIFY_GIT_HEAD_COUNTER: path.join(
                temporaryDirectory,
                'git-head-count',
              ),
              JUNIFY_EXPECTED_HEAD: expectedHead,
              JUNIFY_CHANGE_HEAD: '0',
            },
          },
        );
        expect(result.status, testCase.name).not.toBe(0);
        expect(
          `${String(result.stdout)}${String(result.stderr)}`,
          testCase.name,
        ).toMatch(testCase.error);
        expect(readdirSync(outputDirectory), testCase.name).toEqual([]);
      } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
  });

  test('repeats clean production builds with byte-identical core and player archives', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-canonical-pack-'),
    );
    const outputDirectory = path.join(temporaryDirectory, 'output');
    const npmObserver = createNpmObserver(temporaryDirectory);
    const expectedHead = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).stdout.trim();
    const gitObserver = createGitObserver(temporaryDirectory);
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
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PATH: `${npmObserver.binDirectory}:${gitObserver.binDirectory}:${
              process.env.PATH ?? ''
            }`,
            JUNIFY_REAL_NPM: realExecutable('npm'),
            JUNIFY_NPM_OBSERVATIONS: npmObserver.logPath,
            JUNIFY_REAL_GIT: realExecutable('git'),
            JUNIFY_GIT_OBSERVATIONS: gitObserver.logPath,
            JUNIFY_GIT_HEAD_COUNTER: path.join(
              temporaryDirectory,
              'git-head-count',
            ),
            JUNIFY_EXPECTED_HEAD: expectedHead,
            JUNIFY_CHANGE_HEAD: '0',
          },
          timeout: 180_000,
        },
      );
      if (result.status !== 0) {
        throw new Error(`${result.stdout}${result.stderr}`);
      }

      const manifest = readJson<CanonicalPackageManifest>(
        path.join(outputDirectory, 'combined-manifest.json'),
      );
      const npmPackObservations = readObservations<CommandObservation>(
        npmObserver.logPath,
      ).filter(({ args }) => args[0] === 'pack');
      expect(npmPackObservations).toHaveLength(2);
      for (const observation of npmPackObservations) {
        expect(observation.executable).toBe(
          path.join(npmObserver.binDirectory, 'npm'),
        );
        expect(observation.args.slice(0, 3)).toEqual([
          'pack',
          path.join(repositoryRoot, 'packages/junify-rrweb'),
          path.join(repositoryRoot, 'packages/junify-rrweb-player'),
        ]);
        expect(observation.args.slice(5)).toEqual([
          '--ignore-scripts',
          '--json',
        ]);
        const packResults = JSON.parse(observation.stdout) as Array<{
          filename: string;
          name: string;
          version: string;
        }>;
        expect(
          packResults.map(({ filename, name, version }) => ({
            filename,
            name,
            version,
          })),
        ).toEqual([
          {
            filename: 'junify-app-rrweb-2.1.1-junify.0.tgz',
            name: '@junify-app/rrweb',
            version: '2.1.1-junify.0',
          },
          {
            filename: 'junify-app-rrweb-player-2.1.1-junify.0.tgz',
            name: '@junify-app/rrweb-player',
            version: '2.1.1-junify.0',
          },
        ]);
      }
      expect(manifest.pipeline).toEqual({
        nodeEnv: 'production',
        npmPackArguments: [
          'pack',
          '<absolute-core-directory>',
          '<absolute-player-directory>',
          '--pack-destination',
          '<shared-empty-run-directory>',
          '--ignore-scripts',
          '--json',
        ],
        npmPackInvocationsPerRun: 1,
        runs: 2,
      });
      expect(manifest.source).toMatchObject({
        rrwebCommit: expectedHead,
        startHead: expectedHead,
        endHead: expectedHead,
        worktreeClean: true,
      });
      expect(
        manifest.source.validationStages.map(({ stage }) => stage),
      ).toEqual([
        'preflight',
        'run-1-after-clean',
        'run-1-after-core-build',
        'run-1-after-player-build',
        'run-1-after-pack',
        'run-2-after-clean',
        'run-2-after-core-build',
        'run-2-after-player-build',
        'run-2-after-pack',
        'before-canonical-emission',
      ]);
      for (const validation of manifest.source.validationStages) {
        expect(validation).toEqual({
          generatedResidues: [],
          head: expectedHead,
          stage: validation.stage,
          worktreeClean: true,
        });
      }
      expect(readObservations(gitObserver.logPath)).toEqual(
        Array.from({ length: 10 }, () => [
          {
            args: ['rev-parse', 'HEAD'],
            executable: path.join(gitObserver.binDirectory, 'git'),
          },
          {
            args: ['status', '--porcelain=v1', '--untracked-files=all'],
            executable: path.join(gitObserver.binDirectory, 'git'),
          },
        ]).flat(),
      );

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
