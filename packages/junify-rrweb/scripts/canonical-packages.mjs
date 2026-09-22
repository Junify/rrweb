import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
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
const gitStatusArguments = [
  'status',
  '--porcelain=v1',
  '--untracked-files=all',
];
const generatedResidueRoots = [
  'packages/junify-rrweb',
  'packages/junify-rrweb-player',
  'packages/rrweb-player',
];
const packageDefinitions = {
  core: {
    directory: 'packages/junify-rrweb',
    filename: 'junify-app-rrweb-2.1.1-junify.1.tgz',
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
    filename: 'junify-app-rrweb-player-2.1.1-junify.1.tgz',
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
    for (const artifactDirectory of ['dist', 'umd']) {
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

function generatedBuildResidues() {
  const unexpected = [];
  const visit = (root, directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      const relativePath = path.relative(repositoryRoot, filename);
      const relativeToRoot = path.relative(root, filename);
      const rootPackageName = path.basename(root);
      const insideBoundaryTypes =
        (rootPackageName === 'junify-rrweb' ||
          rootPackageName === 'junify-rrweb-player') &&
        (relativeToRoot === 'types' ||
          relativeToRoot.startsWith(`types${path.sep}`));
      if (entry.isSymbolicLink()) {
        if (insideBoundaryTypes) unexpected.push(relativePath);
      } else if (entry.isDirectory()) {
        if (insideBoundaryTypes && readdirSync(filename).length === 0) {
          unexpected.push(`${relativePath}/`);
        }
        visit(root, filename);
      } else if (
        entry.isFile() &&
        (insideBoundaryTypes ||
          entry.name.endsWith('.svelte.d.ts') ||
          entry.name === 'tsconfig.tsbuildinfo')
      ) {
        unexpected.push(relativePath);
      }
    }
  };
  for (const relativeRoot of generatedResidueRoots) {
    const root = path.join(repositoryRoot, relativeRoot);
    if (existsSync(root)) visit(root, root);
  }
  return [...new Set(unexpected)].sort();
}

function observeCleanSourceState(stage, expectedHead) {
  const head = run('git', ['rev-parse', 'HEAD']);
  if (expectedHead && head !== expectedHead) {
    throw new Error(
      `Source HEAD changed at ${stage}: expected ${expectedHead}, observed ${head}`,
    );
  }
  const statusOutput = run('git', gitStatusArguments);
  const statusLines = statusOutput ? statusOutput.split('\n') : [];
  const generatedResidues = generatedBuildResidues();
  if (statusLines.length > 0 || generatedResidues.length > 0) {
    const details = [
      ...statusLines.map((line) => `git: ${line}`),
      ...generatedResidues.map((filename) => `residue: ${filename}`),
    ];
    throw new Error(
      `Source state is not clean before build or canonical emission (${stage}):\n${details.join(
        '\n',
      )}`,
    );
  }
  return { generatedResidues, head, stage, worktreeClean: true };
}

function createSourceStateGuard() {
  const preflight = observeCleanSourceState('preflight');
  const validations = [preflight];
  return {
    assert(stage) {
      const validation = observeCleanSourceState(stage, preflight.head);
      validations.push(validation);
      return validation;
    },
    expectedHead: preflight.head,
    validations,
  };
}

function buildProductionBoundaries(sourceState, runNumber) {
  cleanBoundaryOutputs();
  sourceState.assert(`run-${runNumber}-after-clean`);
  const environment = { ...process.env, NODE_ENV: 'production' };
  run('yarn', ['workspace', '@junify-app/rrweb', 'build'], {
    env: environment,
  });
  sourceState.assert(`run-${runNumber}-after-core-build`);
  run('yarn', ['workspace', '@junify-app/rrweb-player', 'build'], {
    env: environment,
  });
  sourceState.assert(`run-${runNumber}-after-player-build`);
}

function packageTreeIdentity(artifactPath, extractionDirectory) {
  mkdirSync(extractionDirectory, { recursive: true });
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

function packedBoundaryIdentity(role, definition, packDirectory, runDirectory) {
  const extractionDirectory = path.join(runDirectory, role, 'extracted');
  const artifactPath = path.join(packDirectory, definition.filename);
  if (!existsSync(artifactPath) || !lstatSync(artifactPath).isFile()) {
    throw new Error(`Missing packed ${role} artifact: ${artifactPath}`);
  }
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

function packBoundaries(npmExecutable, runDirectory) {
  const packDirectory = path.join(runDirectory, 'pack');
  mkdirSync(packDirectory, { recursive: true });
  const packResult = JSON.parse(
    run(npmExecutable, [
      'pack',
      ...Object.values(packageDefinitions).map(({ directory }) =>
        path.join(repositoryRoot, directory),
      ),
      '--pack-destination',
      packDirectory,
      '--ignore-scripts',
      '--json',
    ]),
  );
  if (!Array.isArray(packResult) || packResult.length !== 2) {
    throw new Error(
      `Expected exactly two npm pack results: ${JSON.stringify(packResult)}`,
    );
  }
  const definitionsByRole = {};
  for (const result of packResult) {
    const matches = Object.entries(packageDefinitions).filter(
      ([, definition]) =>
        result.name === definition.name &&
        result.version === '2.1.1-junify.1' &&
        result.filename === definition.filename,
    );
    if (matches.length !== 1) {
      throw new Error(`Unexpected npm pack result: ${JSON.stringify(result)}`);
    }
    const [role, definition] = matches[0];
    if (definitionsByRole[role]) {
      throw new Error(`Duplicate npm pack result for ${role}`);
    }
    definitionsByRole[role] = definition;
  }
  for (const role of Object.keys(packageDefinitions)) {
    if (!definitionsByRole[role])
      throw new Error(`Missing npm pack result for ${role}`);
  }
  return Object.fromEntries(
    Object.entries(definitionsByRole).map(([role, definition]) => [
      role,
      packedBoundaryIdentity(role, definition, packDirectory, runDirectory),
    ]),
  );
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
  const sourceState = createSourceStateGuard();
  const npmExecutable = run('which', ['npm']);
  const npmVersion = run(npmExecutable, ['--version']);
  const yarnVersion = run('yarn', ['--version']);
  mkdirSync(resolvedOutputDirectory, { recursive: true });

  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'junify-canonical-pack-runs-'),
  );
  const runsByRole = { core: [], player: [] };
  const packedByRole = { core: [], player: [] };
  const emittedPaths = [];
  try {
    for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
      const runNumber = runIndex + 1;
      buildProductionBoundaries(sourceState, runNumber);
      const runDirectory = path.join(temporaryDirectory, `run-${runIndex + 1}`);
      mkdirSync(runDirectory);
      const packedRun = packBoundaries(npmExecutable, runDirectory);
      sourceState.assert(`run-${runNumber}-after-pack`);
      for (const role of Object.keys(packageDefinitions)) {
        const packed = packedRun[role];
        runsByRole[role].push(packed.identity);
        packedByRole[role].push(packed);
      }
    }

    for (const role of Object.keys(packageDefinitions)) {
      assertDeterministicPackageRuns(role, runsByRole[role]);
    }

    const finalSourceState = sourceState.assert('before-canonical-emission');
    const sourceCommit = sourceState.expectedHead;
    const manifest = {
      schemaVersion: 3,
      source: {
        repository: 'Junify/rrweb',
        rrwebCommit: sourceCommit,
        startHead: sourceState.expectedHead,
        endHead: finalSourceState.head,
        worktreeClean: sourceState.validations.every(
          ({ worktreeClean }) => worktreeClean,
        ),
        validationStages: sourceState.validations,
        cleanPolicy: {
          gitStatusArguments,
          generatedResidueRoots,
          forbiddenResidues: [
            'boundary types directories',
            '*.svelte.d.ts',
            'tsconfig.tsbuildinfo',
          ],
        },
        nodeVersion: process.version,
        npmVersion,
        yarnVersion,
      },
      pipeline: {
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
        runs: runCount,
      },
      packages: Object.fromEntries(
        Object.entries(packageDefinitions).map(([role, definition]) => [
          role,
          {
            name: definition.name,
            version: '2.1.1-junify.1',
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
          'Prior sets did not satisfy the complete clean-source and single-process canonical packaging contract.',
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
        round3CanonicalSet: {
          manifestSha256:
            '592f305c30738a3a2f6adc92a3a562ad941f5ea233da109d093b5e5e8cb3be6a',
          rrwebCommit: 'f0451b2b0a54328eb7f807223f6d2e5d88cc6ada',
          coreSha256:
            'cb3d29c6d7552710a5fa377a8e68ba7e7d5930ba80e4df25a24873efe737a7a3',
          playerSha256:
            'b317a39f16ce786aeabe70aa107195643c2e4602b094bbc896cc3a658f7f6a23',
          classification: 'superseded-insufficient-source-and-process-gates',
        },
      },
      invariants: {
        archiveBytesEqualAcrossRuns: true,
        packageTreesEqualAcrossRuns: true,
        sameRrwebCommit: sourceState.expectedHead === finalSourceState.head,
        treeDigestAlgorithm:
          'SHA-256 of the byte-for-byte package-specific file-census lines sorted by package-relative path',
      },
      releaseState: 'local-verification-only-consumer-revalidation-required',
      published: false,
    };
    for (const role of Object.keys(packageDefinitions)) {
      const canonical = packedByRole[role][0];
      const artifactOutput = path.join(
        resolvedOutputDirectory,
        canonical.identity.file,
      );
      copyFileSync(canonical.artifactPath, artifactOutput);
      emittedPaths.push(artifactOutput);
      const censusOutput = path.join(
        resolvedOutputDirectory,
        `${role}-file-census.sha256`,
      );
      writeFileSync(censusOutput, canonical.censusText);
      emittedPaths.push(censusOutput);
    }
    const manifestOutput = path.join(
      resolvedOutputDirectory,
      'combined-manifest.json',
    );
    writeFileSync(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);
    emittedPaths.push(manifestOutput);
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
  } catch (error) {
    for (const emittedPath of emittedPaths)
      rmSync(emittedPath, { force: true });
    throw error;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const args = parseArguments(process.argv.slice(2));
if (args.verifyRunSummaries) verifyRunSummaries(args.verifyRunSummaries);
else generateCanonicalPackages(args.output, args.runs);
