import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium, type Browser } from 'playwright';
import { format } from 'prettier';
import {
  extractLargeSnapshotCss,
  HISTORICAL_SCENARIO,
  historicalScenarioHtml,
  inspectScenarioCoverage,
  LARGE_SNAPSHOT_SCENARIO,
  largeSnapshotHtml,
  privacySentinels,
  runHistoricalScenarioInPage,
} from './scenarios';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const fixturesRoot = path.join(packageRoot, 'fixtures');
const manifestPath = path.join(fixturesRoot, 'manifest.json');
const localPagePort = 41_783;
const chromeExecutable =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const commandPrefix =
  'PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer';

const producerDefinitions = {
  'rrweb-alpha4-historical': {
    package: 'rrweb',
    alias: 'rrweb-alpha4',
    version: '2.0.0-alpha.4',
    registryIntegrity:
      'sha512-wEHUILbxDPcNwkM3m4qgPgXAiBJyqCbbOHyVoNEVBJzHszWEFYyTbrZqUdeb1EfmTRC2PsumCIkVcomJ/xcOzA==',
    registryTarballUrl:
      'https://registry.npmjs.org/rrweb/-/rrweb-2.0.0-alpha.4.tgz',
    scenario: HISTORICAL_SCENARIO,
    bundle: 'dist/rrweb.js',
  },
  'junify-alpha19-historical': {
    package: '@junify-app/rrweb',
    alias: 'junify-rrweb-alpha19',
    version: '2.0.0-alpha.19',
    registryIntegrity:
      'sha512-0kpxuWenvwwzp1+bhLPlWBKHGHQkXwwRAzCxoBQcD4y9ph4REknQHLF5CJNjtfNfzZUcI9KRT6ILD3jGXgbNsg==',
    registryTarballUrl:
      'https://registry.npmjs.org/@junify-app/rrweb/-/rrweb-2.0.0-alpha.19.tgz',
    scenario: HISTORICAL_SCENARIO,
    bundle: 'dist/rrweb.umd.cjs',
  },
  'junify-alpha20-historical': {
    package: '@junify-app/rrweb',
    alias: 'junify-rrweb-alpha20',
    version: '2.0.0-alpha.20',
    registryIntegrity:
      'sha512-oLI31EWkGhcT+MMfxo2QvMFFeP3vpSYslYvF5YX2KV1qTfKGOQZ924ycr8HILkgx244l6LzX0LCUtKQqWCK0qQ==',
    registryTarballUrl:
      'https://registry.npmjs.org/@junify-app/rrweb/-/rrweb-2.0.0-alpha.20.tgz',
    scenario: HISTORICAL_SCENARIO,
    bundle: 'dist/rrweb.umd.cjs',
  },
  'rrweb-2.1.1-baseline': {
    package: 'rrweb',
    alias: 'rrweb-stable211',
    version: '2.1.1',
    registryIntegrity:
      'sha512-ToxhJg3SsrAhw+/DPhI/2iiwZQIrGK5BGkZ0kHn4qUExcvQYRaolkciD1FWX2+r6vf1IxFyhsoRY18h3D+XoCg==',
    registryTarballUrl: 'https://registry.npmjs.org/rrweb/-/rrweb-2.1.1.tgz',
    scenario: HISTORICAL_SCENARIO,
    bundle: 'umd/rrweb.js',
  },
  'rrweb-2.1.1-large-snapshot': {
    package: 'rrweb',
    alias: 'rrweb-stable211',
    version: '2.1.1',
    registryIntegrity:
      'sha512-ToxhJg3SsrAhw+/DPhI/2iiwZQIrGK5BGkZ0kHn4qUExcvQYRaolkciD1FWX2+r6vf1IxFyhsoRY18h3D+XoCg==',
    registryTarballUrl: 'https://registry.npmjs.org/rrweb/-/rrweb-2.1.1.tgz',
    scenario: LARGE_SNAPSHOT_SCENARIO,
    bundle: 'umd/rrweb.js',
  },
} as const;

type FixtureId = keyof typeof producerDefinitions;
type UnknownRecord = Record<string, unknown>;

interface ManifestEntry {
  id: FixtureId;
  file: string;
  producer: {
    package: string;
    alias: string;
    version: string;
    registryIntegrity: string;
    registryTarball: {
      url: string;
      integrity: string;
      bytes: number;
      sha256: string;
    };
    bundle: { path: string; bytes: number; sha256: string };
  };
  scenario: string;
  browser: { name: string; version: string; userAgent: string };
  createdAt: string;
  creationCommand: string;
  raw: { bytes: number; sha256: string };
  gzip: { bytes: number; sha256: string };
  eventCount: number;
  fullSnapshotIndexes: number[];
  fullSnapshotPayloadSha256: string[];
  privacyScan: {
    passed: boolean;
    sentinelOccurrences: Record<string, number>;
    leakedSentinels: string[];
    scanSha256: string;
  };
  scenarioCoverage: Record<
    string,
    { observed: boolean; eventIndexes: number[] }
  >;
  largeSnapshot?: {
    rawCssBytes: number;
    cssSha256: string;
    fullSnapshotCssSha256: string;
  };
}

interface Manifest {
  schemaVersion: number;
  scenarioVersion: string;
  fixtures: ManifestEntry[];
}

interface ReplayArtifact {
  entry: { id: string };
  events: unknown[];
}

export interface ReplayResult {
  id: string;
  replayed: true;
  finalDomText: string | null;
  shadowText: string | null;
  canvas2dPixel: number[];
  webglClearColor: number[];
  webglPixel: number[];
  truncatedReplaySinks: {
    spaPushText: string | null;
    spaPopText: string | null;
    seekBeforeText: string | null;
    seekAfterText: string | null;
    replaceSyncColor: string;
    replaceAsyncBackground: string;
    emptyReplacementColor: string;
    emptyReplacementBackground: string;
  };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function fullSnapshotIndexes(events: unknown[]): number[] {
  return events.flatMap((event, index) =>
    isRecord(event) && event.type === 2 ? [index] : [],
  );
}

function installedPackagePath(alias: string, child: string): string {
  return path.join(repositoryRoot, 'node_modules', alias, child);
}

function readTarString(bytes: Buffer, start: number, length: number): string {
  return bytes
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '');
}

function extractNpmTarballEntry(tarball: Buffer, entryPath: string): Buffer {
  const tar = gunzipSync(tarball);
  for (let offset = 0; offset + 512 <= tar.byteLength; ) {
    const name = readTarString(tar, offset, 100);
    if (!name) break;
    const prefix = readTarString(tar, offset + 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = readTarString(tar, offset + 124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size))
      throw new Error(`Invalid tar size for ${fullName}`);
    const dataOffset = offset + 512;
    if (fullName === `package/${entryPath}`) {
      return Buffer.from(tar.subarray(dataOffset, dataOffset + size));
    }
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Published tarball does not contain package/${entryPath}`);
}

async function verifyInstalledProducer(id: FixtureId) {
  const definition = producerDefinitions[id];
  const packageJson = JSON.parse(
    await readFile(
      installedPackagePath(definition.alias, 'package.json'),
      'utf8',
    ),
  ) as { name?: string; version?: string };
  if (
    packageJson.name !== definition.package ||
    packageJson.version !== definition.version
  ) {
    const actualName = packageJson.name ?? '<missing-name>';
    const actualVersion = packageJson.version ?? '<missing-version>';
    throw new Error(
      `${id} resolved ${actualName}@${actualVersion}; expected ${definition.package}@${definition.version}`,
    );
  }

  const lock = await readFile(path.join(repositoryRoot, 'yarn.lock'), 'utf8');
  const lockKey = `"${definition.alias}@${definition.registryTarballUrl}":`;
  const lockStart = lock.indexOf(lockKey);
  const lockEnd = lock.indexOf('\n\n', lockStart);
  const lockEntry = lock.slice(lockStart, lockEnd === -1 ? undefined : lockEnd);
  if (
    lockStart === -1 ||
    !lockEntry.includes(`version "${definition.version}"`) ||
    !lockEntry.includes(`resolved "${definition.registryTarballUrl}#`) ||
    !lockEntry.includes(`integrity ${definition.registryIntegrity}`)
  ) {
    throw new Error(
      `${id} is not bound to its registry integrity in yarn.lock`,
    );
  }

  const response = await fetch(definition.registryTarballUrl);
  if (!response.ok) {
    throw new Error(
      `${id} registry tarball fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const tarball = Buffer.from(await response.arrayBuffer());
  const actualIntegrity = `sha512-${createHash('sha512')
    .update(tarball)
    .digest('base64')}`;
  if (actualIntegrity !== definition.registryIntegrity) {
    throw new Error(`${id} registry tarball integrity mismatch`);
  }
  const publishedBundle = extractNpmTarballEntry(tarball, definition.bundle);
  const installedBundle = await readFile(
    installedPackagePath(definition.alias, definition.bundle),
  );
  const publishedBundleSha256 = sha256(publishedBundle);
  const installedBundleSha256 = sha256(installedBundle);
  if (publishedBundleSha256 !== installedBundleSha256) {
    throw new Error(`${id} loaded bundle does not match its registry tarball`);
  }
  return {
    registryTarball: {
      url: definition.registryTarballUrl,
      integrity: actualIntegrity,
      bytes: tarball.byteLength,
      sha256: sha256(tarball),
    },
    bundle: {
      path: definition.bundle,
      bytes: installedBundle.byteLength,
      sha256: installedBundleSha256,
    },
  };
}

function startLocalPage(html: string): Promise<{
  server: Server;
  url: string;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(html);
    });
    server.once('error', reject);
    server.listen(localPagePort, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('deterministic local page did not bind a TCP port'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}/scenario` });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function launchRealBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: chromeExecutable,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
    ],
  });
}

async function recordEvents(
  id: FixtureId,
  browser: Browser,
): Promise<unknown[]> {
  const definition = producerDefinitions[id];
  const pageHtml =
    definition.scenario === LARGE_SNAPSHOT_SCENARIO
      ? largeSnapshotHtml()
      : historicalScenarioHtml();
  const { server, url } = await startLocalPage(pageHtml);
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.addScriptTag({
      path: installedPackagePath(definition.alias, definition.bundle),
    });
    const producerReady = await page.evaluate(
      () =>
        typeof (window as typeof window & { rrweb?: { record?: unknown } })
          .rrweb?.record === 'function',
    );
    if (!producerReady) {
      throw new Error(
        `${definition.package}@${definition.version} UMD bundle did not expose rrweb.record`,
      );
    }
    const events =
      definition.scenario === LARGE_SNAPSHOT_SCENARIO
        ? await page.evaluate(async () => {
            const pageWindow = window as typeof window & {
              rrweb: {
                record: (
                  options: Record<string, unknown>,
                ) => (() => void) | undefined;
              };
            };
            const captured: unknown[] = [];
            const stop = pageWindow.rrweb.record({
              emit: (event: unknown) => captured.push(event),
            });
            if (!stop) throw new Error('stable producer did not start');
            await new Promise((resolve) => setTimeout(resolve, 50));
            stop();
            return captured;
          })
        : await page.evaluate(runHistoricalScenarioInPage, privacySentinels);
    if (pageErrors.length > 0) {
      throw new Error(
        `${definition.package}@${
          definition.version
        } page errors: ${pageErrors.join(' | ')}`,
      );
    }
    return events;
  } finally {
    await page.close();
    await closeServer(server);
  }
}

async function browserProvenance(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const productVersion = browser.version();
    const match = productVersion.match(/(\d+\.\d+\.\d+\.\d+)/);
    if (!match)
      throw new Error(`Cannot parse Chrome version: ${productVersion}`);
    return {
      name: 'Google Chrome',
      version: match[1],
      userAgent,
    };
  } finally {
    await context.close();
  }
}

function scanPrivacy(rawText: string) {
  const sentinelOccurrences = Object.fromEntries(
    Object.entries(privacySentinels).map(([name, sentinel]) => [
      name,
      rawText.split(sentinel).length - 1,
    ]),
  );
  const leakedSentinels = Object.entries(sentinelOccurrences)
    .filter(([, occurrences]) => occurrences > 0)
    .map(([name]) => name);
  return {
    passed: leakedSentinels.length === 0,
    sentinelOccurrences,
    leakedSentinels,
    scanSha256: sha256(JSON.stringify(sentinelOccurrences)),
  };
}

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
}

export async function collectFixtureInto(
  id: FixtureId,
  outputRoot: string,
): Promise<ManifestEntry> {
  const authenticatedProducer = await verifyInstalledProducer(id);
  const definition = producerDefinitions[id];
  const browser = await launchRealBrowser();
  try {
    const browserDetails = await browserProvenance(browser);
    const events = await recordEvents(id, browser);
    const scenarioCoverage = inspectScenarioCoverage(
      events,
      definition.scenario,
    );
    const missingCoverage = Object.entries(scenarioCoverage)
      .filter(([, result]) => !result.observed)
      .map(([name]) => name);
    if (missingCoverage.length > 0) {
      throw new Error(
        `${definition.package}@${definition.version} did not emit required ${
          definition.scenario
        } evidence: ${missingCoverage.join(', ')}`,
      );
    }

    const rawText = JSON.stringify(events);
    const raw = Buffer.from(rawText, 'utf8');
    const gzip = gzipSync(raw, { level: 9 });
    const indexes = fullSnapshotIndexes(events);
    const file = `${id}.events.json.gz`;
    const entry: ManifestEntry = {
      id,
      file,
      producer: {
        package: definition.package,
        alias: definition.alias,
        version: definition.version,
        registryIntegrity: definition.registryIntegrity,
        ...authenticatedProducer,
      },
      scenario: definition.scenario,
      browser: browserDetails,
      createdAt: new Date().toISOString(),
      creationCommand: `${commandPrefix} ${id}`,
      raw: { bytes: raw.byteLength, sha256: sha256(raw) },
      gzip: { bytes: gzip.byteLength, sha256: sha256(gzip) },
      eventCount: events.length,
      fullSnapshotIndexes: indexes,
      fullSnapshotPayloadSha256: indexes.map((index) => {
        const event = events[index] as { data: unknown };
        return sha256(JSON.stringify(event.data));
      }),
      privacyScan: scanPrivacy(rawText),
      scenarioCoverage,
    };
    if (definition.scenario === LARGE_SNAPSHOT_SCENARIO) {
      const css = extractLargeSnapshotCss(events);
      entry.largeSnapshot = {
        rawCssBytes: Buffer.byteLength(css),
        cssSha256: sha256(css),
        fullSnapshotCssSha256: sha256(css),
      };
    }

    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, file), gzip);
    return entry;
  } finally {
    await browser.close();
  }
}

async function generateFixture(id: FixtureId): Promise<ManifestEntry> {
  const entry = await collectFixtureInto(id, fixturesRoot);
  const manifest = await readManifest();
  manifest.fixtures = [
    ...manifest.fixtures.filter((fixture) => fixture.id !== id),
    entry,
  ].sort(
    (left, right) =>
      Object.keys(producerDefinitions).indexOf(left.id) -
      Object.keys(producerDefinitions).indexOf(right.id),
  );
  await writeFile(
    manifestPath,
    format(JSON.stringify(manifest), { parser: 'json' }),
    'utf8',
  );
  return entry;
}

export async function replayFixturesInRealBrowser(
  artifacts: ReplayArtifact[],
): Promise<ReplayResult[]> {
  const browser = await launchRealBrowser();
  const results: ReplayResult[] = [];
  try {
    for (const artifact of artifacts) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      try {
        await page.setContent(
          '<!doctype html><html><body><div id="replay-root"></div></body></html>',
        );
        await page.addScriptTag({
          path: installedPackagePath('rrweb-stable211', 'umd/rrweb.js'),
        });
        const result = await page.evaluate(
          async ({ events }) => {
            type ReplayerShape = {
              on: (event: string, handler: () => void) => void;
              play: () => void;
              pause: (offset?: number) => void;
              destroy: () => void;
              iframe?: HTMLIFrameElement;
            };
            const pageWindow = window as typeof window & {
              rrweb: {
                Replayer: new (
                  events: unknown[],
                  options: Record<string, unknown>,
                ) => ReplayerShape;
              };
              __junifyCompatibilityReplayer?: ReplayerShape;
            };
            const root = document.querySelector('#replay-root');
            if (!(root instanceof HTMLElement))
              throw new Error('replay root missing');
            const playEvents = async (
              replayEvents: unknown[],
              replayRoot: HTMLElement,
              speed: number,
            ) => {
              const replayer = new pageWindow.rrweb.Replayer(replayEvents, {
                root: replayRoot,
                UNSAFE_replayCanvas: true,
                showWarning: false,
                speed,
              });
              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(
                  () => reject(new Error('rrweb 2.1.1 replay did not finish')),
                  10_000,
                );
                replayer.on('finish', () => {
                  clearTimeout(timeout);
                  resolve();
                });
                replayer.play();
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
              return replayer;
            };
            const eventsThroughMarker = (name: string) => {
              const index = events.findIndex((event) => {
                if (typeof event !== 'object' || event === null) return false;
                const data = (event as { type?: number; data?: unknown }).data;
                if (typeof data !== 'object' || data === null) return false;
                const typedData = data as {
                  tag?: string;
                  payload?: { name?: string };
                };
                return (
                  (event as { type?: number }).type === 5 &&
                  typedData.tag === 'junify-scenario-v1' &&
                  typedData.payload?.name === name
                );
              });
              if (index === -1)
                throw new Error(`replay marker missing: ${name}`);
              return events.slice(0, index + 1);
            };
            const replayStage = async (name: string) => {
              const stageRoot = document.createElement('div');
              document.body.append(stageRoot);
              const stageReplayer = await playEvents(
                eventsThroughMarker(name),
                stageRoot,
                100,
              );
              try {
                const stageIframe =
                  stageReplayer.iframe ||
                  stageRoot.querySelector<HTMLIFrameElement>('iframe');
                const stageDocument = stageIframe?.contentDocument;
                if (!stageDocument)
                  throw new Error(`replay stage document missing: ${name}`);
                const styleTarget = stageDocument.querySelector(
                  '.junify-replace-sync-v1',
                );
                if (!styleTarget) {
                  throw new Error(`replay style target missing: ${name}`);
                }
                const style =
                  stageDocument.defaultView?.getComputedStyle(styleTarget);
                if (!style) throw new Error(`computed style missing: ${name}`);
                return {
                  spaText:
                    stageDocument.querySelector('#junify-spa-v1')
                      ?.textContent || null,
                  seekText:
                    stageDocument.querySelector('#junify-seek-v1')
                      ?.textContent || null,
                  color: style.color,
                  background: style.backgroundColor,
                };
              } finally {
                stageReplayer.destroy();
                stageRoot.remove();
              }
            };

            const seekBefore = await replayStage('junify-seek-before-v1');
            const spaPush = await replayStage('junify-spa-push-state-v1');
            const spaPop = await replayStage('junify-spa-popstate-v1');
            const replaceSync = await replayStage('junify-replace-sync-v1');
            const replaceAsync = await replayStage('junify-replace-async-v1');
            const emptyReplacement = await replayStage(
              'junify-stylesheet-empty-replace-sync-v1',
            );
            const seekAfter = await replayStage('junify-seek-after-v1');
            const truncatedReplaySinks = {
              spaPushText: spaPush.spaText,
              spaPopText: spaPop.spaText,
              seekBeforeText: seekBefore.seekText,
              seekAfterText: seekAfter.seekText,
              replaceSyncColor: replaceSync.color,
              replaceAsyncBackground: replaceAsync.background,
              emptyReplacementColor: emptyReplacement.color,
              emptyReplacementBackground: emptyReplacement.background,
            };

            const replayer = await playEvents(events, root, 10);
            pageWindow.__junifyCompatibilityReplayer = replayer;

            const iframe =
              replayer.iframe ||
              root.querySelector<HTMLIFrameElement>('iframe');
            const replayDocument = iframe?.contentDocument;
            if (!replayDocument)
              throw new Error('replay iframe document missing');
            const finalDomText =
              replayDocument.querySelector('#junify-seek-v1')?.textContent;
            const shadowText = replayDocument
              .querySelector('#junify-shadow-host-v1')
              ?.shadowRoot?.querySelector(
                '#junify-shadow-marker-v1',
              )?.textContent;

            const canvas2d = replayDocument.querySelector(
              '#junify-canvas-2d-v1',
            );
            if (canvas2d?.tagName !== 'CANVAS') {
              throw new Error('replayed Canvas2D missing');
            }
            const context2d = (canvas2d as HTMLCanvasElement).getContext('2d');
            if (!context2d)
              throw new Error('replayed Canvas2D context missing');
            const canvas2dPixel = Array.from(
              context2d.getImageData(0, 0, 1, 1).data,
            );

            const canvasWebgl = replayDocument.querySelector(
              '#junify-canvas-webgl-v1',
            );
            if (canvasWebgl?.tagName !== 'CANVAS') {
              throw new Error('replayed WebGL canvas missing');
            }
            const webgl = ((canvasWebgl as HTMLCanvasElement).getContext(
              'webgl',
              {
                preserveDrawingBuffer: true,
              },
            ) ||
              (canvasWebgl as HTMLCanvasElement).getContext(
                'experimental-webgl',
                {
                  preserveDrawingBuffer: true,
                },
              )) as WebGLRenderingContext | null;
            if (!webgl || typeof webgl.readPixels !== 'function') {
              throw new Error('replayed WebGL context missing');
            }
            const webglClearColor = Array.from(
              webgl.getParameter(webgl.COLOR_CLEAR_VALUE) as Float32Array,
            );
            return {
              replayed: true as const,
              finalDomText: finalDomText || null,
              shadowText: shadowText || null,
              canvas2dPixel: Array.from(canvas2dPixel),
              webglClearColor,
              truncatedReplaySinks,
            };
          },
          { events: artifact.events },
        );
        const replayFrame = page
          .frames()
          .find((frame) => frame !== page.mainFrame());
        if (!replayFrame) throw new Error('replay iframe was not created');
        const webglImage = await replayFrame
          .locator('#junify-canvas-webgl-v1')
          .screenshot();
        const decodedWebgl = PNG.sync.read(webglImage);
        const webglPixel = Array.from(decodedWebgl.data.subarray(0, 4));
        await page.evaluate(() => {
          const pageWindow = window as typeof window & {
            __junifyCompatibilityReplayer?: { destroy: () => void };
          };
          pageWindow.__junifyCompatibilityReplayer?.destroy();
        });
        results.push({
          id: artifact.entry.id,
          ...result,
          webglPixel,
        });
      } finally {
        await page.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const producerFlag = process.argv.indexOf('--producer');
  const requested = process.argv[producerFlag + 1];
  if (producerFlag === -1 || !requested) {
    throw new Error(
      `Use --producer with one of: ${Object.keys(producerDefinitions).join(
        ', ',
      )}`,
    );
  }
  if (!(requested in producerDefinitions)) {
    throw new Error(`Unknown fixture producer id: ${requested}`);
  }
  const entry = await generateFixture(requested as FixtureId);
  process.stdout.write(
    `${entry.id}: ${entry.eventCount} events, ${entry.gzip.bytes} gzip bytes, ${entry.gzip.sha256}\n`,
  );
}

if (process.argv.includes('--producer')) {
  await main();
}
