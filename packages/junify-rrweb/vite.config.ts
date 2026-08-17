import path from 'node:path';
import { copyFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import config from '../../vite.config.default';

const localSourceEntries = new Map([
  ['rrweb', path.resolve(__dirname, '../rrweb/src/index.ts')],
  ['@rrweb/types', path.resolve(__dirname, '../types/src/index.ts')],
  ['@rrweb/utils', path.resolve(__dirname, '../utils/src/index.ts')],
  ['rrdom', path.resolve(__dirname, '../rrdom/src/index.ts')],
  ['rrweb-snapshot', path.resolve(__dirname, '../rrweb-snapshot/src/index.ts')],
]);

function resolveLocalRrwebSource(): Plugin {
  const resolvedLocalSpecifiers = new Set<string>();
  return {
    name: 'resolve-local-rrweb-source',
    enforce: 'pre',
    resolveId(source) {
      const localSource = localSourceEntries.get(source);
      if (localSource) resolvedLocalSpecifiers.add(source);
      return localSource || null;
    },
    transform(_code, id) {
      const filename = id.split('?')[0];
      for (const [specifier, localSource] of localSourceEntries) {
        if (filename === localSource) resolvedLocalSpecifiers.add(specifier);
      }
    },
    generateBundle() {
      if (resolvedLocalSpecifiers.size !== localSourceEntries.size) {
        throw new Error(
          'The boundary build did not resolve every local rrweb source alias',
        );
      }
      this.emitFile({
        type: 'asset',
        fileName: 'local-source-map.json',
        source: `${JSON.stringify(
          Object.fromEntries(
            [...localSourceEntries].map(([specifier, filename]) => [
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
