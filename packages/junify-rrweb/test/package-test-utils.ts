import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  rrwebPackageName: '@junify-app/rrweb' | 'rrweb' = '@junify-app/rrweb',
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
  const diagnostics = collectStrictTypeScriptDiagnostics(
    consumerDirectory,
    typescriptPath,
  );
  assertExactUpstreamDeclarationDiagnostics(diagnostics, rrwebPackageName);
  assertPinnedUpstreamDeclarationDigests(consumerDirectory, rrwebPackageName);

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
  return ['TS1254', 'TS2395', 'TS2663', 'TS2717'];
}

export function collectStrictTypeScriptDiagnostics(
  consumerDirectory: string,
  typescriptPath = path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
): string {
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
  return diagnostics;
}

export function assertExactUpstreamDeclarationDiagnostics(
  diagnostics: string,
  rrwebPackageName: '@junify-app/rrweb' | 'rrweb',
): void {
  const diagnosticLines = diagnostics.trim().split('\n').sort();
  const diagnosticPattern =
    /^(node_modules\/.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/;
  const unparsedLine = diagnosticLines.find(
    (line) => !diagnosticPattern.test(line),
  );
  if (unparsedLine) {
    throw new Error(
      `Unparsed strict TypeScript diagnostic line: ${unparsedLine}`,
    );
  }

  const rrwebDeclarationRoot = `node_modules/${rrwebPackageName}/dist/rrweb`;
  const mergedRecordMessage =
    "Individual declarations in merged declaration 'record' must be all exported or all local.";
  const missingNodeTypeMessage =
    "Cannot find name 'RRNodeType'. Did you mean the instance member 'this.RRNodeType'?";
  const ambientInitializerMessage =
    "A 'const' initializer in an ambient context must be a string or numeric literal or literal enum reference.";
  const expectedDiagnostics = [
    ...['d.cts', 'd.ts'].flatMap((extension) =>
      [
        [211, 25],
        [213, 26],
        [464, 19],
      ].map(
        ([line, column]) =>
          `${rrwebDeclarationRoot}.${extension}(${line},${column}): error TS2395: ${mergedRecordMessage}`,
      ),
    ),
    "node_modules/@types/css-font-loading-module/index.d.ts(22,9): error TS2717: Subsequent property declarations must have the same type.  Property 'display' must be of type 'FontDisplay | undefined', but here has type 'string | undefined'.",
    "node_modules/@types/css-font-loading-module/index.d.ts(42,9): error TS2717: Subsequent property declarations must have the same type.  Property 'display' must be of type 'FontDisplay', but here has type 'string'.",
    ...['d.cts', 'd.ts'].flatMap((extension) =>
      [15, 26, 48, 74, 86, 152].flatMap((line) => [
        `node_modules/rrdom/dist/index.${extension}(${line},27): error TS2663: ${missingNodeTypeMessage}`,
        `node_modules/rrdom/dist/index.${extension}(${line},27): error TS1254: ${ambientInitializerMessage}`,
      ]),
    ),
  ].sort();
  if (JSON.stringify(diagnosticLines) !== JSON.stringify(expectedDiagnostics)) {
    throw new Error(
      `Unexpected exact upstream declaration diagnostics:\n${diagnostics}`,
    );
  }
}

function assertPinnedUpstreamDeclarationDigests(
  consumerDirectory: string,
  rrwebPackageName: '@junify-app/rrweb' | 'rrweb',
): void {
  const expectedDeclarationDigests = new Map([
    [
      `node_modules/${rrwebPackageName}/dist/rrweb.d.cts`,
      'c59c5624be860f9b0ff3c6b29c4488e34941e0c2858f7a7e777b48d840513c74',
    ],
    [
      `node_modules/${rrwebPackageName}/dist/rrweb.d.ts`,
      'c59c5624be860f9b0ff3c6b29c4488e34941e0c2858f7a7e777b48d840513c74',
    ],
    [
      'node_modules/rrdom/dist/index.d.cts',
      '3aa897e61acfcbfe2c48421667186457457aafbd12de13ad6f2a6b569d2ed439',
    ],
    [
      'node_modules/rrdom/dist/index.d.ts',
      '3aa897e61acfcbfe2c48421667186457457aafbd12de13ad6f2a6b569d2ed439',
    ],
    [
      'node_modules/@types/css-font-loading-module/index.d.ts',
      '7e98cfd52d447cbb862839a6b93daab18147e6ea0be1751458b9529ee738516b',
    ],
  ]);
  for (const [relativePath, expectedDigest] of expectedDeclarationDigests) {
    const actualDigest = createHash('sha256')
      .update(readFileSync(path.join(consumerDirectory, relativePath)))
      .digest('hex');
    if (actualDigest !== expectedDigest) {
      throw new Error(
        `Pinned upstream declaration digest mismatch for ${relativePath}: ${actualDigest}`,
      );
    }
  }

  const freshLocalDeclarationDigests = new Map([
    [
      'packages/rrweb/dist/rrweb.d.ts',
      'c59c5624be860f9b0ff3c6b29c4488e34941e0c2858f7a7e777b48d840513c74',
    ],
    [
      'packages/rrdom/dist/index.d.ts',
      '3aa897e61acfcbfe2c48421667186457457aafbd12de13ad6f2a6b569d2ed439',
    ],
  ]);
  for (const [relativePath, expectedDigest] of freshLocalDeclarationDigests) {
    const actualDigest = createHash('sha256')
      .update(readFileSync(path.join(repositoryRoot, relativePath)))
      .digest('hex');
    if (actualDigest !== expectedDigest) {
      throw new Error(
        `Freshly built upstream declaration digest mismatch for ${relativePath}: ${actualDigest}`,
      );
    }
  }
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
