import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  allDeclarationText,
  assertOnlyArtifactFiles,
  installPackedBoundaries,
  type PackedBoundary,
  packBoundary,
  readJson,
  removeTemporaryDirectory,
  repositoryRoot,
  runNode,
  runTypeScriptConsumerWithUpstreamDiagnosticGate,
  writeJson,
} from '../../junify-rrweb/test/package-test-utils';

const forbiddenRenamedInternals =
  /@junify-app\/(?:packer|replay|rrdom|rrweb-snapshot|snapshot|types|utils)/;

interface PlayerRuntimeExports {
  type: string;
  same: boolean;
}

interface ArtifactTreeSnapshot {
  contentDigest: string;
  metadataDigest: string;
  regularFileCount: number;
}

function snapshotArtifactTree(packageDirectory: string): ArtifactTreeSnapshot {
  const relativeFiles = ['README.md', 'package.json'];
  for (const artifactDirectory of ['dist', 'umd']) {
    const visit = (relativeDirectory: string): void => {
      for (const entry of readdirSync(
        path.join(packageDirectory, relativeDirectory),
        { withFileTypes: true },
      )) {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) visit(relativePath);
        else if (entry.isFile()) relativeFiles.push(relativePath);
        else
          throw new Error(`Unexpected artifact tree member: ${relativePath}`);
      }
    };
    visit(artifactDirectory);
  }

  const contentCensus: string[] = [];
  const metadataCensus: string[] = [];
  for (const relativePath of relativeFiles.sort()) {
    const filename = path.join(packageDirectory, relativePath);
    const contents = readFileSync(filename);
    const stats = statSync(filename, { bigint: true });
    contentCensus.push(
      `${createHash('sha256').update(contents).digest('hex')}  ${
        contents.byteLength
      }  ${relativePath}`,
    );
    metadataCensus.push(
      `${relativePath}\0${stats.mode}\0${stats.size}\0${stats.mtimeNs}`,
    );
  }

  return {
    contentDigest: createHash('sha256')
      .update(`${contentCensus.join('\n')}\n`)
      .digest('hex'),
    metadataDigest: createHash('sha256')
      .update(`${metadataCensus.join('\n')}\n`)
      .digest('hex'),
    regularFileCount: relativeFiles.length,
  };
}

function generatedPlayerBuildArtifacts(): string[] {
  const sourceRoot = path.join(repositoryRoot, 'packages/rrweb-player');
  const artifacts: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (
        entry.isFile() &&
        (entry.name.endsWith('.svelte.d.ts') ||
          entry.name === 'tsconfig.tsbuildinfo')
      ) {
        artifacts.push(path.relative(repositoryRoot, filename));
      }
    }
  };
  visit(sourceRoot);
  return artifacts.sort();
}

describe('@junify-app/rrweb-player packed boundary', () => {
  let rrwebBoundary: PackedBoundary;
  let playerBoundary: PackedBoundary;
  let consumerDirectory: string;

  beforeAll(() => {
    rrwebBoundary = packBoundary('packages/junify-rrweb');
    playerBoundary = packBoundary('packages/junify-rrweb-player');
    consumerDirectory = installPackedBoundaries([
      rrwebBoundary,
      playerBoundary,
    ]);
  }, 120_000);

  afterAll(() => {
    removeTemporaryDirectory(consumerDirectory);
    removeTemporaryDirectory(playerBoundary?.temporaryDirectory);
    removeTemporaryDirectory(rrwebBoundary?.temporaryDirectory);
  });

  test('installs both exact prerelease artifacts in one isolated consumer', () => {
    const installedCore = readJson<{ version: string }>(
      path.join(
        consumerDirectory,
        'node_modules/@junify-app/rrweb/package.json',
      ),
    );
    const installedPlayer = readJson<{ version: string }>(
      path.join(
        consumerDirectory,
        'node_modules/@junify-app/rrweb-player/package.json',
      ),
    );
    expect(installedCore.version).toBe('2.1.1-junify.0');
    expect(installedPlayer.version).toBe('2.1.1-junify.0');
  });

  test('publishes the exact player identity and stable artifact names', () => {
    expect(playerBoundary.filename).toBe(
      'junify-app-rrweb-player-2.1.1-junify.0.tgz',
    );
    expect(playerBoundary.manifest).toMatchObject({
      name: '@junify-app/rrweb-player',
      version: '2.1.1-junify.0',
      main: './dist/rrweb-player.umd.cjs',
      module: './dist/rrweb-player.js',
      unpkg: './dist/rrweb-player.umd.cjs',
      jsdelivr: './umd/rrweb-player.js',
      style: './dist/style.css',
      typings: 'dist/rrweb-player.d.ts',
      files: ['umd', 'dist', 'package.json'],
    });
    expect(playerBoundary.contents).toEqual(
      expect.arrayContaining([
        'package/dist/rrweb-player.cjs',
        'package/dist/rrweb-player.d.cts',
        'package/dist/rrweb-player.d.ts',
        'package/dist/rrweb-player.js',
        'package/dist/rrweb-player.umd.cjs',
        'package/dist/local-source-map.json',
        'package/dist/style.css',
        'package/umd/rrweb-player.js',
      ]),
    );
    assertOnlyArtifactFiles(playerBoundary.contents);
  });

  test('keeps replay, packer, and type dependencies in official namespaces', () => {
    const dependencies = playerBoundary.manifest.dependencies as Record<
      string,
      string
    >;
    expect(Object.keys(dependencies).sort()).toEqual([
      '@rrweb/packer',
      '@rrweb/replay',
      '@tsconfig/svelte',
      'svelte',
    ]);
    expect(JSON.stringify(dependencies)).not.toMatch(forbiddenRenamedInternals);
    expect(allDeclarationText(playerBoundary)).not.toMatch(
      forbiddenRenamedInternals,
    );
  });

  test('loads the same player constructor through installed ESM and CJS exports', () => {
    const esm = JSON.parse(
      runNode(
        consumerDirectory,
        'player-esm-smoke.mjs',
        `import Player, { Player as NamedPlayer } from '@junify-app/rrweb-player';
console.log(JSON.stringify({ type: typeof Player, same: Player === NamedPlayer }));`,
      ),
    ) as PlayerRuntimeExports;
    const cjs = JSON.parse(
      runNode(
        consumerDirectory,
        'player-cjs-smoke.cjs',
        `const player = require('@junify-app/rrweb-player');
console.log(JSON.stringify({ type: typeof player.default, same: player.default === player.Player }));`,
      ),
    ) as PlayerRuntimeExports;
    expect(esm).toEqual({ type: 'function', same: true });
    expect(cjs).toEqual(esm);
  });

  test('resolves CSS containing both player and local replay rules', () => {
    const result = JSON.parse(
      runNode(
        consumerDirectory,
        'player-css-smoke.mjs',
        `import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const css = require.resolve('@junify-app/rrweb-player/dist/style.css');
console.log(JSON.stringify({ css, text: readFileSync(css, 'utf8') }));`,
      ),
    ) as { css: string; text: string };
    expect(result.css).toMatch(
      /@junify-app[\\/]rrweb-player[\\/]dist[\\/]style\.css$/,
    );
    expect(result.text).toContain('.rr-player');
    expect(result.text).toContain('.replayer-wrapper');
  });

  test('resolves strict player types while gating upstream diagnostics', () => {
    writeFileSync(
      path.join(consumerDirectory, 'player-types-smoke.ts'),
      `import Player, { Player as NamedPlayer } from '@junify-app/rrweb-player';
const defaultConstructor: typeof NamedPlayer = Player;
const namedConstructor: typeof Player = NamedPlayer;
void defaultConstructor;
void namedConstructor;
`,
    );
    writeFileSync(
      path.join(consumerDirectory, 'player-types-smoke.cts'),
      `import Player = require('@junify-app/rrweb-player');
const defaultConstructor: typeof Player.Player = Player.default;
const namedConstructor: typeof Player.default = Player.Player;
void defaultConstructor;
void namedConstructor;
`,
    );
    writeJson(path.join(consumerDirectory, 'tsconfig.json'), {
      compilerOptions: {
        lib: ['DOM', 'ES2022'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
        target: 'ES2022',
      },
      include: ['player-types-smoke.ts', 'player-types-smoke.cts'],
    });
    expect(
      runTypeScriptConsumerWithUpstreamDiagnosticGate(
        consumerDirectory,
        'rrweb',
      ),
    ).toEqual(['TS1254', 'TS2395', 'TS2663', 'TS2717']);
  });

  test('maps replay code and CSS to local patched rrweb sources', () => {
    const javascriptMap = readJson<{ sources: string[] }>(
      path.join(
        playerBoundary.extractedPackageDirectory,
        'dist/rrweb-player.js.map',
      ),
    );
    const localSourceMap = readJson<
      Record<string, { path: string; sha256: string }>
    >(
      path.join(
        playerBoundary.extractedPackageDirectory,
        'dist/local-source-map.json',
      ),
    );
    expect(javascriptMap.sources).toContain('../../rrweb/src/replay/index.ts');
    expect(javascriptMap.sources).toContain(
      '../../rrweb-player/src/Player.svelte',
    );
    expect(Object.keys(localSourceMap)).toEqual([
      '@rrweb/replay/dist/style.css',
      '@rrweb/replay',
    ]);
    expect(localSourceMap).toEqual({
      '@rrweb/replay/dist/style.css': {
        path: '../rrweb/src/replay/styles/style.css',
        sha256:
          '64d720c3a8966a3764822abf7b14f78135c90ce09dcfae4286e50f06d9e01545',
      },
      '@rrweb/replay': {
        path: '../rrweb/src/entries/replay.ts',
        sha256:
          'bf3839b86088d3375069731425539a516603f116ff0deb7b7747fa9cb583a7e1',
      },
    });
    expect(
      javascriptMap.sources.some((source) =>
        source.includes('node_modules/@rrweb/replay'),
      ),
    ).toBe(false);
  });

  test('fails the build when replay CSS resolves to the official artifact', () => {
    const boundaryDirectory = path.join(
      repositoryRoot,
      'packages/junify-rrweb-player',
    );
    const configPath = path.join(boundaryDirectory, 'vite.config.ts');
    const probeConfigPath = path.join(
      boundaryDirectory,
      `.vite-config-css-provenance-probe-${process.pid}.ts`,
    );
    const probeDirectory = mkdtempSync(
      path.join(tmpdir(), 'junify-rrweb-player-css-probe-'),
    );
    const probeOutputDirectory = path.join(probeDirectory, 'dist');
    const originalConfig = readFileSync(configPath, 'utf8');
    const localTarget =
      "path.resolve(__dirname, '../rrweb/src/replay/styles/style.css'),";
    const mutationIndex = originalConfig.lastIndexOf(localTarget);
    if (mutationIndex < 0) throw new Error('Cannot locate replay CSS alias');
    const mutatedConfig = `${originalConfig.slice(
      0,
      mutationIndex,
    )}path.resolve(__dirname, '../replay/dist/style.css'),${originalConfig.slice(
      mutationIndex + localTarget.length,
    )}`
      .replace('      viteSvelteDts(),\n', '')
      .replace('      copyCommonJsDeclaration(),\n', '');
    const vitePath = path.join(repositoryRoot, 'node_modules/vite/bin/vite.js');
    const beforeProbe = snapshotArtifactTree(boundaryDirectory);
    const generatedArtifactsBeforeProbe = generatedPlayerBuildArtifacts();

    let mutationResult: ReturnType<typeof spawnSync>;
    try {
      writeFileSync(probeConfigPath, mutatedConfig);
      mutationResult = spawnSync(
        process.execPath,
        [
          vitePath,
          'build',
          '--config',
          probeConfigPath,
          '--outDir',
          probeOutputDirectory,
          '--emptyOutDir',
        ],
        { cwd: boundaryDirectory, encoding: 'utf8' },
      );
    } finally {
      rmSync(probeConfigPath, { force: true });
      rmSync(probeDirectory, { recursive: true, force: true });
    }

    expect(snapshotArtifactTree(boundaryDirectory)).toEqual(beforeProbe);
    expect(generatedPlayerBuildArtifacts()).toEqual(
      generatedArtifactsBeforeProbe,
    );

    const output = `${String(mutationResult.stdout)}${String(
      mutationResult.stderr,
    )}`;
    expect(mutationResult.status).not.toBe(0);
    expect(output).toMatch(/required local replay source.*style\.css/i);
  }, 30_000);

  test('exposes the player constructor and bundled replay in a real browser', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.addStyleTag({
        path: path.join(
          consumerDirectory,
          'node_modules/@junify-app/rrweb-player/dist/style.css',
        ),
      });
      await page.addScriptTag({
        path: path.join(
          consumerDirectory,
          'node_modules/@junify-app/rrweb-player/umd/rrweb-player.js',
        ),
      });
      const result = await page.evaluate(() => {
        const target = document.createElement('div');
        document.body.append(target);
        const playerNamespace = (
          window as unknown as Window & {
            rrwebPlayer: {
              default: new (options: {
                target: Element;
                props: { events: unknown[] };
              }) => { $destroy(): void; getReplayer: unknown };
              Player: unknown;
            };
          }
        ).rrwebPlayer;
        const PlayerConstructor = playerNamespace.default;
        if (PlayerConstructor !== playerNamespace.Player) {
          throw new Error('UMD default and named Player exports diverged');
        }
        const player = new PlayerConstructor({
          target,
          props: {
            events: [
              {
                type: 4,
                data: {
                  href: 'https://example.test/',
                  width: 800,
                  height: 600,
                },
                timestamp: 1,
              },
              {
                type: 4,
                data: {
                  href: 'https://example.test/',
                  width: 800,
                  height: 600,
                },
                timestamp: 2,
              },
            ],
          },
        });
        const result = {
          constructor: typeof PlayerConstructor,
          getReplayer: typeof player.getReplayer,
          rendered: target.querySelector('.rr-player') !== null,
          styleRules: Array.from(document.styleSheets).reduce(
            (count, sheet) => count + (sheet.cssRules?.length ?? 0),
            0,
          ),
        };
        player.$destroy();
        return result;
      });
      expect(result).toMatchObject({
        constructor: 'function',
        getReplayer: 'function',
        rendered: true,
      });
      expect(result.styleRules).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
