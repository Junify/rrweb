import path from 'node:path';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import config from '../../vite.config.default';

const requiredLocalSourceEntries = new Map([
  ['rrweb', path.resolve(__dirname, '../rrweb/src/index.ts')],
  ['@rrweb/types', path.resolve(__dirname, '../types/src/index.ts')],
  ['@rrweb/utils', path.resolve(__dirname, '../utils/src/index.ts')],
  ['rrdom', path.resolve(__dirname, '../rrdom/src/index.ts')],
  ['rrweb-snapshot', path.resolve(__dirname, '../rrweb-snapshot/src/index.ts')],
]);

const localSourceAliases = new Map([
  ['rrweb', path.resolve(__dirname, '../rrweb/src/index.ts')],
  ['@rrweb/types', path.resolve(__dirname, '../types/src/index.ts')],
  ['@rrweb/utils', path.resolve(__dirname, '../utils/src/index.ts')],
  ['rrdom', path.resolve(__dirname, '../rrdom/src/index.ts')],
  ['rrweb-snapshot', path.resolve(__dirname, '../rrweb-snapshot/src/index.ts')],
]);

interface ObservedSource {
  path: string;
  sha256: string;
}

function sourceDigest(filename: string): string {
  return createHash('sha256').update(readFileSync(filename)).digest('hex');
}

function resolveLocalRrwebSource(): Plugin {
  const resolvedTargets = new Map<string, string>();
  const observedSources = new Map<string, ObservedSource>();
  function observe(id: string): void {
    const filename = id.split('?')[0];
    for (const [specifier, resolvedTarget] of resolvedTargets) {
      if (filename === resolvedTarget) {
        observedSources.set(specifier, {
          path: filename,
          sha256: sourceDigest(filename),
        });
      }
    }
  }
  return {
    name: 'resolve-local-rrweb-source',
    enforce: 'pre',
    resolveId(source) {
      const localSource = localSourceAliases.get(source);
      if (localSource) resolvedTargets.set(source, localSource);
      return localSource || null;
    },
    load(id) {
      observe(id);
      return null;
    },
    transform(_code, id) {
      observe(id);
    },
    generateBundle() {
      for (const [specifier, requiredSource] of requiredLocalSourceEntries) {
        const observed = observedSources.get(specifier);
        if (!observed || observed.path !== requiredSource) {
          throw new Error(
            `Required local rrweb source ${specifier} expected ${requiredSource}, transformed ${
              observed?.path || 'nothing'
            }`,
          );
        }
        const requiredDigest = sourceDigest(requiredSource);
        if (observed.sha256 !== requiredDigest) {
          throw new Error(
            `Required local rrweb source ${specifier} digest mismatch: ${observed.sha256}`,
          );
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'local-source-map.json',
        source: `${JSON.stringify(
          Object.fromEntries(
            [...requiredLocalSourceEntries].map(([specifier]) => {
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

function copyLocalRrwebDeclarations(): Plugin {
  return {
    name: 'copy-local-rrweb-declarations',
    apply: 'build',
    closeBundle() {
      for (const extension of ['d.ts', 'd.cts']) {
        copyFileSync(
          path.resolve(__dirname, `../rrweb/dist/rrweb.${extension}`),
          path.resolve(__dirname, `dist/rrweb.${extension}`),
        );
      }
    },
  };
}

export default config(path.resolve(__dirname, 'src/index.ts'), 'rrweb', {
  fileName: 'rrweb',
  plugins: [resolveLocalRrwebSource(), copyLocalRrwebDeclarations()],
});
