import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
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
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const expectedNodeVersion = 'v20.9.0';
const packageDefinitions = {
  core: {
    directory: 'packages/junify-rrweb',
    filename: 'junify-app-rrweb-2.1.1-junify.0.tgz',
    name: '@junify-app/rrweb',
    regularFileCount: 19,
    entrypoints: {
      esm: ['dist/rrweb.js'],
      cjs: ['dist/rrweb.cjs'],
      umd: [
        'dist/rrweb.umd.cjs',
        'dist/rrweb.umd.min.cjs',
        'umd/rrweb.js',
        'umd/rrweb.min.js',
      ],
      css: ['dist/style.css', 'dist/style.min.css'],
      types: ['dist/rrweb.d.ts', 'dist/rrweb.d.cts'],
    },
  },
  player: {
    directory: 'packages/junify-rrweb-player',
    filename: 'junify-app-rrweb-player-2.1.1-junify.0.tgz',
    name: '@junify-app/rrweb-player',
    regularFileCount: 18,
    entrypoints: {
      esm: ['dist/rrweb-player.js'],
      cjs: ['dist/rrweb-player.cjs'],
      umd: [
        'dist/rrweb-player.umd.cjs',
        'dist/rrweb-player.umd.min.cjs',
        'umd/rrweb-player.js',
        'umd/rrweb-player.min.js',
      ],
      css: ['dist/style.css', 'dist/style.min.css'],
      types: ['dist/rrweb-player.d.ts', 'dist/rrweb-player.d.cts'],
    },
  },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${String(
        result.status,
      )}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function digest(contents, algorithm) {
  return createHash(algorithm).update(contents).digest('hex');
}

function cleanBoundaryOutputs() {
  for (const definition of Object.values(packageDefinitions)) {
    for (const artifactDirectory of ['dist', 'umd', 'types']) {
      rmSync(
        path.join(repositoryRoot, definition.directory, artifactDirectory),
        {
          recursive: true,
          force: true,
        },
      );
    }
  }
}

function assertNoGeneratedPlayerArtifacts() {
  const unexpected = [];
  const root = path.join(repositoryRoot, 'packages/rrweb-player');
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (
        entry.isFile() &&
        (entry.name.endsWith('.svelte.d.ts') ||
          entry.name === 'tsconfig.tsbuildinfo')
      ) {
        unexpected.push(path.relative(repositoryRoot, filename));
      }
    }
  };
  visit(root);
  if (unexpected.length > 0) {
    throw new Error(
      `Generated player build artifacts remain in the source tree:\n${unexpected.join(
        '\n',
      )}`,
    );
  }
}

function buildProductionBoundaries() {
  cleanBoundaryOutputs();
  assertNoGeneratedPlayerArtifacts();
  const environment = { ...process.env, NODE_ENV: 'production' };
  run('yarn', ['workspace', '@junify-app/rrweb', 'build'], {
    env: environment,
  });
  run('yarn', ['workspace', '@junify-app/rrweb-player', 'build'], {
    env: environment,
  });
  assertNoGeneratedPlayerArtifacts();
}

function packageTreeIdentity(artifactPath, extractionDirectory) {
  mkdirSync(extractionDirectory);
  run('tar', ['-xzf', artifactPath, '-C', extractionDirectory]);
  const packageDirectory = path.join(extractionDirectory, 'package');
  const relativeFiles = [];
  const visit = (relativeDirectory) => {
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
    const contents = readFileSync(filename);
    return `${digest(contents, 'sha256')}  ${
      contents.byteLength
    }  ${relativePath}`;
  });
  const censusText = `${census.join('\n')}\n`;
  return {
    censusText,
    regularFileCount: relativeFiles.length,
    treeDigestSha256: digest(censusText, 'sha256'),
  };
}

function packBoundary(role, definition, runDirectory) {
  const packDirectory = path.join(runDirectory, role, 'pack');
  const extractionDirectory = path.join(runDirectory, role, 'extracted');
  mkdirSync(packDirectory, { recursive: true });
  const packResult = JSON.parse(
    run('npm', [
      'pack',
      path.join(repositoryRoot, definition.directory),
      '--pack-destination',
      packDirectory,
      '--ignore-scripts',
      '--json',
    ]),
  );
  if (
    packResult.length !== 1 ||
    packResult[0].filename !== definition.filename
  ) {
    throw new Error(
      `Unexpected npm pack result for ${role}: ${JSON.stringify(packResult)}`,
    );
  }
  const artifactPath = path.join(packDirectory, definition.filename);
  const contents = readFileSync(artifactPath);
  const tree = packageTreeIdentity(artifactPath, extractionDirectory);
  if (tree.regularFileCount !== definition.regularFileCount) {
    throw new Error(
      `Unexpected ${role} package file count: ${tree.regularFileCount}`,
    );
  }
  const sha512 = createHash('sha512').update(contents);
  const identity = {
    file: definition.filename,
    bytes: contents.byteLength,
    sha256: digest(contents, 'sha256'),
    sha512: sha512.copy().digest('hex'),
    sha512Integrity: `sha512-${sha512.digest('base64')}`,
    regularFileCount: tree.regularFileCount,
    treeDigestSha256: tree.treeDigestSha256,
  };
  return { artifactPath, censusText: tree.censusText, identity };
}

function assertDeterministicPackageRuns(role, runs) {
  if (runs.length < 2) {
    throw new Error(`At least two runs are required for ${role}`);
  }
  const expected = runs[0];
  for (const observed of runs.slice(1)) {
    if (
      observed.bytes !== expected.bytes ||
      observed.sha256 !== expected.sha256 ||
      observed.sha512 !== expected.sha512 ||
      observed.sha512Integrity !== expected.sha512Integrity
    ) {
      throw new Error(
        `Non-deterministic archive bytes for ${role}: ${expected.sha256} != ${observed.sha256}`,
      );
    }
    if (
      observed.regularFileCount !== expected.regularFileCount ||
      observed.treeDigestSha256 !== expected.treeDigestSha256
    ) {
      throw new Error(
        `Non-deterministic unpacked package tree for ${role}: ${expected.treeDigestSha256} != ${observed.treeDigestSha256}`,
      );
    }
  }
}

function parseArguments(args) {
  const parsed = { output: undefined, runs: 2, verifyRunSummaries: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--output') parsed.output = args[++index];
    else if (argument === '--runs') parsed.runs = Number(args[++index]);
    else if (argument === '--verify-run-summaries') {
      parsed.verifyRunSummaries = args[++index];
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

function verifyRunSummaries(filename) {
  const summaries = JSON.parse(readFileSync(filename, 'utf8'));
  assertDeterministicPackageRuns('provided summaries', summaries);
  process.stdout.write('Run summaries are byte-for-byte deterministic.\n');
}

function generateCanonicalPackages(outputDirectory, runCount) {
  if (process.version !== expectedNodeVersion) {
    throw new Error(
      `Canonical packages require Node ${expectedNodeVersion}; received ${process.version}`,
    );
  }
  if (!Number.isInteger(runCount) || runCount < 2) {
    throw new Error('--runs must be an integer of at least 2');
  }
  if (!outputDirectory) throw new Error('--output is required');
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  if (
    existsSync(resolvedOutputDirectory) &&
    readdirSync(resolvedOutputDirectory).length > 0
  ) {
    throw new Error(
      `Refusing to overwrite non-empty output: ${resolvedOutputDirectory}`,
    );
  }
  mkdirSync(resolvedOutputDirectory, { recursive: true });

  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'junify-canonical-pack-runs-'),
  );
  const runsByRole = { core: [], player: [] };
  const packedByRole = { core: [], player: [] };
  try {
    for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
      buildProductionBoundaries();
      const runDirectory = path.join(temporaryDirectory, `run-${runIndex + 1}`);
      mkdirSync(runDirectory);
      for (const [role, definition] of Object.entries(packageDefinitions)) {
        const packed = packBoundary(role, definition, runDirectory);
        runsByRole[role].push(packed.identity);
        packedByRole[role].push(packed);
      }
    }

    for (const role of Object.keys(packageDefinitions)) {
      assertDeterministicPackageRuns(role, runsByRole[role]);
      const canonical = packedByRole[role][0];
      copyFileSync(
        canonical.artifactPath,
        path.join(resolvedOutputDirectory, canonical.identity.file),
      );
      writeFileSync(
        path.join(resolvedOutputDirectory, `${role}-file-census.sha256`),
        canonical.censusText,
      );
    }

    const sourceCommit = run('git', ['rev-parse', 'HEAD']);
    const manifest = {
      schemaVersion: 2,
      source: {
        repository: 'rrweb-io/rrweb',
        rrwebCommit: sourceCommit,
        worktreeClean: run('git', ['status', '--porcelain']).length === 0,
        nodeVersion: process.version,
        npmVersion: run('npm', ['--version']),
        yarnVersion: run('yarn', ['--version']),
      },
      pipeline: {
        nodeEnv: 'production',
        npmPackArguments: ['--ignore-scripts', '--json'],
        runs: runCount,
      },
      packages: Object.fromEntries(
        Object.entries(packageDefinitions).map(([role, definition]) => [
          role,
          {
            name: definition.name,
            version: '2.1.1-junify.0',
            rrwebCommit: sourceCommit,
            artifact: runsByRole[role][0],
            deterministicRuns: runsByRole[role],
            fileCensus: `${role}-file-census.sha256`,
            entrypoints: definition.entrypoints,
          },
        ]),
      ),
      supersededArtifacts: {
        reason:
          'The prior set did not come from one declared clean production build and npm pack pipeline.',
        core: {
          sha256:
            'e075ed25b6c90cc5be73a2ba15c47abe72704bd33c82de4806a62e3c5421cef9',
          treeDigestSha256:
            'b9ff62b0b55b66c2fb58efb39999e6ebb138b6d99f243cf86e1e3c2cca271720',
          classification: 'superseded-noncanonical-archive',
        },
        player: {
          sha256:
            'c4bd708dd3c4c03af0aa61c6b021083b1f0f79f87e28928af94c21984ec5f1bb',
          treeDigestSha256:
            '6b8aaaf9fadbd358360746966e92d40f9ade201852d29ec9eaf7ae9e6d0c9654',
          classification: 'quarantined-hybrid-build',
        },
      },
      invariants: {
        archiveBytesEqualAcrossRuns: true,
        packageTreesEqualAcrossRuns: true,
        sameRrwebCommit: true,
        treeDigestAlgorithm:
          'SHA-256 of the byte-for-byte package-specific file-census lines sorted by package-relative path',
      },
      releaseState: 'local-verification-only-consumer-revalidation-required',
      published: false,
    };
    writeFileSync(
      path.join(resolvedOutputDirectory, 'combined-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          output: resolvedOutputDirectory,
          packages: Object.fromEntries(
            Object.entries(runsByRole).map(([role, runs]) => [role, runs[0]]),
          ),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const args = parseArguments(process.argv.slice(2));
if (args.verifyRunSummaries) verifyRunSummaries(args.verifyRunSummaries);
else generateCanonicalPackages(args.output, args.runs);
