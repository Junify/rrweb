import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

export interface PackedBoundary {
  artifactPath: string;
  contents: string[];
  extractedPackageDirectory: string;
  filename: string;
  manifest: Record<string, unknown>;
  temporaryDirectory: string;
}

export function packBoundary(packageDirectory: string): PackedBoundary {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'junify-rrweb-boundary-'),
  );
  const packDirectory = path.join(temporaryDirectory, 'pack');
  const extractedPackageDirectory = path.join(temporaryDirectory, 'extracted');
  mkdirSync(packDirectory);
  mkdirSync(extractedPackageDirectory);

  const packResult = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        path.join(repositoryRoot, packageDirectory),
        '--pack-destination',
        packDirectory,
        '--ignore-scripts',
        '--json',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ),
  ) as Array<{ filename: string; files: Array<{ path: string }> }>;

  if (packResult.length !== 1) {
    throw new Error(
      `Expected one packed artifact, received ${packResult.length}`,
    );
  }

  const [{ filename, files }] = packResult;
  const artifactPath = path.join(packDirectory, filename);
  execFileSync('tar', ['-xzf', artifactPath, '-C', extractedPackageDirectory]);

  return {
    artifactPath,
    contents: files.map((file) => `package/${file.path}`).sort(),
    extractedPackageDirectory: path.join(extractedPackageDirectory, 'package'),
    filename,
    manifest: JSON.parse(
      readFileSync(
        path.join(extractedPackageDirectory, 'package', 'package.json'),
        'utf8',
      ),
    ) as Record<string, unknown>,
    temporaryDirectory,
  };
}

export function installPackedBoundaries(boundaries: PackedBoundary[]): string {
  const consumerDirectory = mkdtempSync(
    path.join(tmpdir(), 'junify-rrweb-consumer-'),
  );
  const dependencies = Object.fromEntries(
    boundaries.map((boundary) => [
      boundary.manifest.name as string,
      `file:${boundary.artifactPath}`,
    ]),
  );

  writeJson(path.join(consumerDirectory, 'package.json'), {
    name: 'junify-rrweb-boundary-smoke-consumer',
    private: true,
    type: 'module',
    dependencies,
  });
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--package-lock=false',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: consumerDirectory, encoding: 'utf8', stdio: 'pipe' },
  );
  return consumerDirectory;
}

export function runNode(
  consumerDirectory: string,
  filename: string,
  source: string,
): string {
  writeFileSync(path.join(consumerDirectory, filename), source);
  return execFileSync(process.execPath, [filename], {
    cwd: consumerDirectory,
    encoding: 'utf8',
  }).trim();
}

export function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(filename, 'utf8')) as T;
}

export function writeJson(filename: string, value: unknown): void {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

export function runTypeScriptConsumerWithUpstreamDiagnosticGate(
  consumerDirectory: string,
): string[] {
  const configPath = path.join(consumerDirectory, 'tsconfig.json');
  const config = readJson<{
    compilerOptions: Record<string, unknown>;
    include: string[];
  }>(configPath);
  if (
    config.compilerOptions.strict !== true ||
    'skipLibCheck' in config.compilerOptions
  ) {
    throw new Error(
      'The initial consumer typecheck must be strict with library checking enabled',
    );
  }

  const typescriptPath = path.join(
    repositoryRoot,
    'node_modules/typescript/bin/tsc',
  );
  const strictResult = spawnSync(process.execPath, [typescriptPath], {
    cwd: consumerDirectory,
    encoding: 'utf8',
  });
  const diagnostics = `${strictResult.stdout}${strictResult.stderr}`;
  if (strictResult.status !== 2) {
    throw new Error(
      `Expected the pinned upstream 2.1.1 declaration diagnostics, received status ${String(
        strictResult.status,
      )}:\n${diagnostics}`,
    );
  }

  const diagnosticCodes = [
    ...new Set(
      [...diagnostics.matchAll(/\berror (TS\d+):/g)].map((match) => match[1]),
    ),
  ].sort();
  const expectedCodes = ['TS1254', 'TS2395', 'TS2663', 'TS2717'];
  if (JSON.stringify(diagnosticCodes) !== JSON.stringify(expectedCodes)) {
    throw new Error(
      `Unexpected strict declaration diagnostics ${JSON.stringify(
        diagnosticCodes,
      )}:\n${diagnostics}`,
    );
  }

  const diagnosticFiles = diagnostics
    .split('\n')
    .filter((line) => /\(\d+,\d+\): error TS\d+:/.test(line));
  const upstreamDeclaration =
    /^node_modules\/(?:@junify-app\/rrweb\/dist\/rrweb\.d\.(?:c)?ts|rrweb\/dist\/rrweb\.d\.(?:c)?ts|rrdom\/dist\/index\.d\.(?:c)?ts|@types\/css-font-loading-module\/index\.d\.ts)\(/;
  const unexpectedDiagnostic = diagnosticFiles.find(
    (line) => !upstreamDeclaration.test(line),
  );
  if (unexpectedDiagnostic) {
    throw new Error(
      `Strict consumer source or boundary resolution failed: ${unexpectedDiagnostic}`,
    );
  }

  writeJson(configPath, {
    ...config,
    compilerOptions: {
      ...config.compilerOptions,
      skipLibCheck: true,
    },
  });
  execFileSync(process.execPath, [typescriptPath], {
    cwd: consumerDirectory,
    stdio: 'pipe',
  });
  return diagnosticCodes;
}

export function removeTemporaryDirectory(directory: string | undefined): void {
  if (directory) rmSync(directory, { recursive: true, force: true });
}

export function assertOnlyArtifactFiles(contents: string[]): void {
  for (const filename of contents) {
    if (
      filename.startsWith('package/src/') ||
      filename.startsWith('package/test/') ||
      filename.includes('/node_modules/')
    ) {
      throw new Error(`Unexpected non-artifact file in tarball: ${filename}`);
    }
  }
}

export function allDeclarationText(boundary: PackedBoundary): string {
  return boundary.contents
    .filter((filename) => /\.d\.(?:c|m)?ts$/.test(filename))
    .map((filename) =>
      readFileSync(
        path.join(
          boundary.extractedPackageDirectory,
          filename.replace(/^package\//, ''),
        ),
        'utf8',
      ),
    )
    .join('\n');
}
