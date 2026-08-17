import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = path.resolve(packageRoot, '..', '..');

export const candidateBundle = path.join(
  repositoryRoot,
  'packages',
  'rrweb',
  'dist',
  'rrweb.umd.cjs',
);

export const officialStableBundle = path.join(
  repositoryRoot,
  'node_modules',
  'rrweb-stable211',
  'umd',
  'rrweb.js',
);

export const launchCompatibilityBrowser = () =>
  chromium.launch({
    headless: true,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
