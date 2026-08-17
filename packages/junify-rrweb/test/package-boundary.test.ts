import { writeFileSync } from 'node:fs';
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
  runNode,
  runTypeScriptConsumerWithUpstreamDiagnosticGate,
  writeJson,
} from './package-test-utils';

const forbiddenRenamedInternals =
  /@junify-app\/(?:packer|replay|rrdom|rrweb-snapshot|snapshot|types|utils)/;

interface RuntimeExports {
  record: string;
  Replayer: string;
}

describe('@junify-app/rrweb packed boundary', () => {
  let boundary: PackedBoundary;
  let consumerDirectory: string;

  beforeAll(() => {
    boundary = packBoundary('packages/junify-rrweb');
    consumerDirectory = installPackedBoundaries([boundary]);
  }, 120_000);

  afterAll(() => {
    removeTemporaryDirectory(consumerDirectory);
    removeTemporaryDirectory(boundary?.temporaryDirectory);
  });

  test('publishes the exact boundary identity and stable rrweb artifact names', () => {
    expect(boundary.filename).toBe('junify-app-rrweb-2.1.1-junify.0.tgz');
    expect(boundary.manifest).toMatchObject({
      name: '@junify-app/rrweb',
      version: '2.1.1-junify.0',
      main: './dist/rrweb.umd.cjs',
      module: './dist/rrweb.js',
      unpkg: './dist/rrweb.umd.cjs',
      jsdelivr: './umd/rrweb.js',
      style: './dist/style.css',
      typings: 'dist/rrweb.d.ts',
      files: ['umd', 'dist', 'package.json'],
    });
    expect(boundary.contents).toEqual(
      expect.arrayContaining([
        'package/dist/rrweb.cjs',
        'package/dist/rrweb.d.cts',
        'package/dist/rrweb.d.ts',
        'package/dist/rrweb.js',
        'package/dist/local-source-map.json',
        'package/dist/rrweb.umd.cjs',
        'package/dist/style.css',
        'package/umd/rrweb.js',
      ]),
    );
    assertOnlyArtifactFiles(boundary.contents);
  });

  test('keeps official internal dependency and declaration namespaces', () => {
    const dependencies = boundary.manifest.dependencies as Record<
      string,
      string
    >;
    expect(Object.keys(dependencies).sort()).toEqual([
      '@rrweb/types',
      '@rrweb/utils',
      '@types/css-font-loading-module',
      '@xstate/fsm',
      'base64-arraybuffer',
      'mitt',
      'rrdom',
      'rrweb-snapshot',
    ]);
    expect(JSON.stringify(dependencies)).not.toMatch(forbiddenRenamedInternals);
    expect(allDeclarationText(boundary)).not.toMatch(forbiddenRenamedInternals);
  });

  test('loads record and Replayer through installed ESM and CJS exports', () => {
    const esm = JSON.parse(
      runNode(
        consumerDirectory,
        'esm-smoke.mjs',
        `import { record, Replayer } from '@junify-app/rrweb';
console.log(JSON.stringify({ record: typeof record, Replayer: typeof Replayer }));`,
      ),
    ) as RuntimeExports;
    const cjs = JSON.parse(
      runNode(
        consumerDirectory,
        'cjs-smoke.cjs',
        `const { record, Replayer } = require('@junify-app/rrweb');
console.log(JSON.stringify({ record: typeof record, Replayer: typeof Replayer }));`,
      ),
    ) as RuntimeExports;
    expect(esm).toEqual({ record: 'function', Replayer: 'function' });
    expect(cjs).toEqual(esm);
  });

  test('resolves the exported replay CSS from the installed package', () => {
    const result = JSON.parse(
      runNode(
        consumerDirectory,
        'css-smoke.mjs',
        `import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const css = require.resolve('@junify-app/rrweb/dist/style.css');
console.log(JSON.stringify({ css, text: readFileSync(css, 'utf8') }));`,
      ),
    ) as { css: string; text: string };
    expect(result.css).toMatch(
      /@junify-app[\\/]rrweb[\\/]dist[\\/]style\.css$/,
    );
    expect(result.text).toContain('.replayer-wrapper');
  });

  test('resolves strict ESM and CJS types while gating upstream diagnostics', () => {
    writeFileSync(
      path.join(consumerDirectory, 'types-smoke.ts'),
      `import { record, Replayer, type eventWithTime, type recordOptions } from '@junify-app/rrweb';
const recordFunction: (options?: recordOptions<eventWithTime>) => (() => void) | undefined = record;
const ReplayerConstructor: typeof Replayer = Replayer;
void recordFunction;
void ReplayerConstructor;
`,
    );
    writeFileSync(
      path.join(consumerDirectory, 'types-smoke.cts'),
      `import rrweb = require('@junify-app/rrweb');
const { record, Replayer } = rrweb;
type recordOptions = rrweb.recordOptions<rrweb.eventWithTime>;
const recordFunction: (options?: recordOptions) => (() => void) | undefined = record;
const ReplayerConstructor: typeof Replayer = Replayer;
void recordFunction;
void ReplayerConstructor;
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
      include: ['types-smoke.ts', 'types-smoke.cts'],
    });
    expect(
      runTypeScriptConsumerWithUpstreamDiagnosticGate(consumerDirectory),
    ).toEqual(['TS1254', 'TS2395', 'TS2663', 'TS2717']);
  });

  test('maps the bundle to the patched local rrweb source entry', () => {
    const sourceMap = readJson<{ sources: string[] }>(
      path.join(boundary.extractedPackageDirectory, 'dist/rrweb.js.map'),
    );
    expect(sourceMap.sources).toContain('../../rrweb/src/index.ts');
    expect(
      sourceMap.sources.some((source) => source.includes('node_modules/rrweb')),
    ).toBe(false);
    const localSourceMap = readJson<Record<string, string>>(
      path.join(
        boundary.extractedPackageDirectory,
        'dist/local-source-map.json',
      ),
    );
    expect(localSourceMap.rrweb).toBe('../rrweb/src/index.ts');
  });

  test('exposes the rrweb UMD global in a real browser', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.addScriptTag({
        path: path.join(
          consumerDirectory,
          'node_modules/@junify-app/rrweb/umd/rrweb.js',
        ),
      });
      expect(
        await page.evaluate(() => {
          const rrweb = (
            window as Window & {
              rrweb?: { record?: unknown; Replayer?: unknown };
            }
          ).rrweb;
          return {
            record: typeof rrweb?.record,
            Replayer: typeof rrweb?.Replayer,
          };
        }),
      ).toEqual({ record: 'function', Replayer: 'function' });
    } finally {
      await browser.close();
    }
  }, 30_000);
});
