import { copyFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import glob from 'fast-glob';
import {
  defaultClientConditions,
  defineConfig,
  mergeConfig,
  type Plugin,
} from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sveltePreprocess from 'svelte-preprocess';
import { emitDts, type EmitDtsConfig } from 'svelte2tsx';
import config from '../../vite.config.default';

const upstreamPlayerSource = path.resolve(__dirname, '../rrweb-player/src');
const upstreamPlayerRoot = path.dirname(upstreamPlayerSource);
const declarationDirectory = path.resolve(__dirname, 'types');
const require = createRequire(import.meta.url);
const svelteShimsPath = require.resolve('svelte2tsx/svelte-shims-v4.d.ts');
const generatedSourceDeclarations: string[] = [];

async function generateDts(inputPath: string): Promise<void> {
  const dtsConfig: EmitDtsConfig = {
    declarationDir: declarationDirectory,
    libRoot: path.dirname(inputPath),
    svelteShimsPath,
  };
  await emitDts(dtsConfig);
}

function viteSvelteDts(): Plugin {
  return {
    name: 'vite-plugin-svelte-dts',
    apply: 'build',
    async buildStart(options) {
      const { input } = options;
      const inputs =
        typeof input === 'string'
          ? [input]
          : Array.isArray(input)
          ? input
          : Object.values(input);
      for (const inputPath of inputs) await generateDts(inputPath);

      const files = await glob('**/*.svelte.d.ts', {
        cwd: declarationDirectory,
        absolute: true,
      });
      for (const file of files) {
        const destination = path.resolve(
          upstreamPlayerSource,
          path.relative(declarationDirectory, file),
        );
        copyFileSync(file, destination);
        generatedSourceDeclarations.push(destination);
      }
    },
    closeBundle() {
      for (const file of generatedSourceDeclarations.splice(0)) {
        rmSync(file, { force: true });
      }
      rmSync(declarationDirectory, { recursive: true, force: true });
    },
  };
}

function copyCommonJsDeclaration(): Plugin {
  return {
    name: 'copy-commonjs-declaration',
    apply: 'build',
    closeBundle() {
      copyFileSync(
        path.resolve(__dirname, 'dist/rrweb-player.d.ts'),
        path.resolve(__dirname, 'dist/rrweb-player.d.cts'),
      );
    },
  };
}

const localReplayEntries = new Map([
  [
    '@rrweb/replay/dist/style.css',
    path.resolve(__dirname, '../rrweb/src/replay/styles/style.css'),
  ],
  ['@rrweb/replay', path.resolve(__dirname, '../rrweb/src/entries/replay.ts')],
]);

function resolveLocalReplaySource(): Plugin {
  const resolvedLocalSpecifiers = new Set<string>();
  return {
    name: 'resolve-local-replay-source',
    enforce: 'pre',
    resolveId(source) {
      const localSource = localReplayEntries.get(source);
      if (localSource) resolvedLocalSpecifiers.add(source);
      return localSource || null;
    },
    transform(_code, id) {
      const filename = id.split('?')[0];
      for (const [specifier, localSource] of localReplayEntries) {
        if (filename === localSource) resolvedLocalSpecifiers.add(specifier);
      }
    },
    generateBundle() {
      if (resolvedLocalSpecifiers.size !== localReplayEntries.size) {
        throw new Error(
          'The player build did not resolve every local replay alias',
        );
      }
      this.emitFile({
        type: 'asset',
        fileName: 'local-source-map.json',
        source: `${JSON.stringify(
          Object.fromEntries(
            [...localReplayEntries].map(([specifier, filename]) => [
              specifier,
              path.relative(__dirname, filename).split(path.sep).join('/'),
            ]),
          ),
          null,
          2,
        )}\n`,
      });
    },
  };
}

const sveltePlugins = svelte({
  preprocess: [sveltePreprocess({ typescript: true })],
}) as Plugin[];
const baseConfig = config(
  path.resolve(upstreamPlayerSource, 'main.ts'),
  'rrwebPlayer',
  {
    fileName: 'rrweb-player',
    plugins: [
      resolveLocalReplaySource(),
      viteSvelteDts(),
      copyCommonJsDeclaration(),
      ...sveltePlugins,
    ],
  },
);

export default defineConfig((environment) =>
  mergeConfig(
    typeof baseConfig === 'function' ? baseConfig(environment) : baseConfig,
    {
      root: upstreamPlayerRoot,
      publicDir: false,
      css: {
        devSourcemap: true,
      },
      build: {
        outDir: path.resolve(__dirname, 'dist'),
      },
      resolve: {
        conditions: [...defaultClientConditions],
      },
    },
  ),
);
