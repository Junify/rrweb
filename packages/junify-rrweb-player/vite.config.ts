import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import glob from 'fast-glob';
import {
  defaultClientConditions,
  defineConfig,
  mergeConfig,
  type Alias,
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
  const originalWorkingDirectory = process.cwd();
  try {
    process.chdir(upstreamPlayerRoot);
    await emitDts(dtsConfig);
  } finally {
    process.chdir(originalWorkingDirectory);
  }
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
    closeBundle: {
      order: 'post',
      handler() {
        copyFileSync(
          path.resolve(__dirname, 'dist/rrweb-player.d.ts'),
          path.resolve(__dirname, 'dist/rrweb-player.d.cts'),
        );
      },
    },
  };
}

const requiredLocalReplayEntries = new Map([
  [
    '@rrweb/replay/dist/style.css',
    path.resolve(__dirname, '../rrweb/src/replay/styles/style.css'),
  ],
  ['@rrweb/replay', path.resolve(__dirname, '../rrweb/src/entries/replay.ts')],
]);

const localReplayAliases = new Map([
  [
    '@rrweb/replay/dist/style.css',
    path.resolve(__dirname, '../rrweb/src/replay/styles/style.css'),
  ],
  ['@rrweb/replay', path.resolve(__dirname, '../rrweb/src/entries/replay.ts')],
]);

interface ObservedSource {
  path: string;
  sha256: string;
}

const resolvedAliasTargets = new Map<string, string>();
const replayAliases: Alias[] = [...localReplayAliases].map(
  ([specifier, replacement]) => ({
    find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement,
    customResolver(source) {
      const filename = source.split('?')[0];
      resolvedAliasTargets.set(specifier, filename);
      return filename;
    },
  }),
);

function sourceDigest(filename: string): string {
  return createHash('sha256').update(readFileSync(filename)).digest('hex');
}

function resolveLocalReplaySource(): Plugin {
  const observedSources = new Map<string, ObservedSource>();
  function observe(id: string): void {
    const filename = id.split('?')[0];
    for (const [specifier, requiredSource] of requiredLocalReplayEntries) {
      if (filename === requiredSource) {
        observedSources.set(specifier, {
          path: filename,
          sha256: sourceDigest(filename),
        });
      }
    }
  }
  return {
    name: 'resolve-local-replay-source',
    enforce: 'pre',
    load(id) {
      observe(id);
      return null;
    },
    transform(_code, id) {
      observe(id);
    },
    generateBundle() {
      for (const [specifier, requiredSource] of requiredLocalReplayEntries) {
        const resolvedTarget = resolvedAliasTargets.get(specifier);
        if (resolvedTarget !== requiredSource) {
          throw new Error(
            `Required local replay source ${specifier} expected ${requiredSource}, resolved ${
              resolvedTarget || 'nothing'
            }`,
          );
        }
        const observed = observedSources.get(specifier);
        if (!observed || observed.path !== requiredSource) {
          throw new Error(
            `Required local replay source ${specifier} expected ${requiredSource}, transformed ${
              observed?.path || 'nothing'
            }`,
          );
        }
        const requiredDigest = sourceDigest(requiredSource);
        if (observed.sha256 !== requiredDigest) {
          throw new Error(
            `Required local replay source ${specifier} digest mismatch: ${observed.sha256}`,
          );
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'local-source-map.json',
        source: `${JSON.stringify(
          Object.fromEntries(
            [...requiredLocalReplayEntries].map(([specifier]) => {
              const observed = observedSources.get(specifier)!;
              return [
                specifier,
                {
                  path: path
                    .relative(__dirname, observed.path)
                    .split(path.sep)
                    .join('/'),
                  sha256: observed.sha256,
                },
              ];
            }),
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
        alias: replayAliases,
        conditions: [...defaultClientConditions],
      },
    },
  ),
);
