import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import {
  expectedFixtures,
  loadRequiredManifest,
  packageRoot,
  readAndVerifyFixture,
  sha256,
} from './fixture-test-utils';

describe('junify.compatibility.wire-format historical producer fixtures', () => {
  it('locks producer, browser, command, hashes, indexes, and scenario provenance', async () => {
    const manifest = await loadRequiredManifest();
    const { inspectScenarioCoverage, privacySentinels } = await import(
      '../src/scenarios'
    );

    for (const entry of manifest.fixtures) {
      const expected = expectedFixtures[entry.id];
      expect(entry.producer).toMatchObject({
        package: expected.package,
        alias: expected.alias,
        version: expected.version,
        registryIntegrity: expected.integrity,
      });
      const installedPackage = JSON.parse(
        await readFile(
          path.join(
            packageRoot,
            '..',
            '..',
            'node_modules',
            expected.alias,
            'package.json',
          ),
          'utf8',
        ),
      ) as { name: string; version: string };
      expect(installedPackage).toMatchObject({
        name: expected.package,
        version: expected.version,
      });
      expect(entry.scenario).toBe(expected.scenario);
      expect(entry.browser.name).toBe('Google Chrome');
      expect(entry.browser.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(entry.browser.userAgent).toContain('Chrome/');
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
      expect(entry.creationCommand).toBe(
        `PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer ${entry.id}`,
      );

      const { raw, events } = await readAndVerifyFixture(entry);
      const fullSnapshotIndexes = events.flatMap((event, index) =>
        (event as { type?: number }).type === 2 ? [index] : [],
      );
      expect(entry.fullSnapshotIndexes).toEqual(fullSnapshotIndexes);
      expect(entry.fullSnapshotPayloadSha256).toEqual(
        fullSnapshotIndexes.map((index) =>
          sha256(JSON.stringify((events[index] as { data: unknown }).data)),
        ),
      );
      expect(entry.scenarioCoverage).toEqual(
        inspectScenarioCoverage(events, entry.scenario),
      );
      expect(
        Object.values(entry.scenarioCoverage).every((item) => item.observed),
      ).toBe(true);

      const rawText = raw.toString('utf8');
      const sentinelOccurrences = Object.fromEntries(
        Object.entries(privacySentinels).map(([name, sentinel]) => [
          name,
          rawText.split(sentinel).length - 1,
        ]),
      );
      const leakedSentinels = Object.entries(sentinelOccurrences)
        .filter(([, occurrences]) => occurrences > 0)
        .map(([name]) => name);
      expect(entry.privacyScan.sentinelOccurrences).toEqual(
        sentinelOccurrences,
      );
      expect(entry.privacyScan.leakedSentinels).toEqual(leakedSentinels);
      expect(entry.privacyScan.passed).toBe(leakedSentinels.length === 0);
      expect(entry.privacyScan.scanSha256).toBe(
        sha256(JSON.stringify(sentinelOccurrences)),
      );
    }
  });

  it('rejects marker-only SPA and seek evidence when serialized target mutations are removed', async () => {
    const manifest = await loadRequiredManifest();
    const entry = manifest.fixtures.find(
      ({ id }) => id === 'rrweb-2.1.1-baseline',
    );
    if (!entry) throw new Error('stable baseline fixture missing');
    const { events } = await readAndVerifyFixture(entry);
    const mutationValues = new Set([
      'junify-spa-push-state-v1',
      'junify-spa-popstate-v1',
      'junify-seek-before-v1',
      'junify-seek-after-v1',
    ]);
    const withoutTargetMutations = structuredClone(events) as Array<{
      type?: number;
      data?: {
        source?: number;
        texts?: Array<{ value?: string }>;
        adds?: Array<{ node?: { textContent?: string } }>;
      };
    }>;
    for (const event of withoutTargetMutations) {
      if (event.type !== 3 || event.data?.source !== 0) continue;
      event.data.texts = event.data.texts?.filter(
        ({ value }) => !value || !mutationValues.has(value),
      );
      event.data.adds = event.data.adds?.filter(
        ({ node }) =>
          !node?.textContent || !mutationValues.has(node.textContent),
      );
    }
    const serialized = JSON.stringify(withoutTargetMutations);
    expect(serialized).toContain('junify-spa-push-state-v1');
    expect(serialized).toContain('junify-seek-before-v1');

    const { inspectScenarioCoverage } = await import('../src/scenarios');
    const coverage = inspectScenarioCoverage(
      withoutTargetMutations,
      entry.scenario,
    );
    expect(coverage.spaPushState.observed).toBe(false);
    expect(coverage.spaPopstate.observed).toBe(false);
    expect(coverage.seekReadyMutations.observed).toBe(false);
  });
});

describe('junify.canvas candidate persisted artifact', () => {
  it('records and replays Canvas2D and WebGL pixels through serialized JSON', async () => {
    const chromeExecutable =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const candidateBundle = path.join(
      packageRoot,
      '..',
      'rrweb',
      'dist',
      'rrweb.umd.cjs',
    );
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'junify-canvas-artifact-'),
    );
    const artifactPath = path.join(temporaryDirectory, 'events.json');

    try {
      const recordPage = await browser.newPage();
      await recordPage.setContent(`
        <!doctype html>
        <html>
          <body>
            <canvas id="junify-candidate-2d" width="2" height="2"></canvas>
            <canvas id="junify-candidate-webgl" width="2" height="2"></canvas>
          </body>
        </html>
      `);
      await recordPage.addScriptTag({ path: candidateBundle });
      const recorded = await recordPage.evaluate(async () => {
        type EventShape = {
          type?: number;
          data?: {
            source?: number;
            type?: number;
            commands?: Array<{ property?: string; args?: unknown[] }>;
          };
        };
        const pageWindow = window as typeof window & {
          rrweb: {
            record: (
              options: Record<string, unknown>,
            ) => (() => void) | undefined;
            createInlineImageBitmapProcessor: () => (
              params: Record<string, unknown>,
            ) => Promise<Record<string, unknown>>;
          };
        };
        const events: EventShape[] = [];
        const stop = pageWindow.rrweb.record({
          emit: (event: EventShape) => events.push(event),
          recordCanvas: true,
          sampling: { canvas: 30 },
          imageBitmapProcessor:
            pageWindow.rrweb.createInlineImageBitmapProcessor(),
        });

        const canvas2d = document.querySelector(
          '#junify-candidate-2d',
        ) as HTMLCanvasElement;
        const context2d = canvas2d.getContext('2d');
        if (!context2d) throw new Error('candidate Canvas2D context missing');
        context2d.fillStyle = '#ff0000';
        context2d.fillRect(0, 0, 2, 2);

        const canvasWebgl = document.querySelector(
          '#junify-candidate-webgl',
        ) as HTMLCanvasElement;
        const webgl = canvasWebgl.getContext('webgl', {
          preserveDrawingBuffer: true,
        });
        if (!webgl) throw new Error('candidate WebGL context missing');
        webgl.clearColor(0, 0.5, 0, 1);
        webgl.clear(webgl.COLOR_BUFFER_BIT);

        await new Promise((resolve) => setTimeout(resolve, 250));
        stop?.();
        const webglPixel = new Uint8Array(4);
        webgl.readPixels(
          0,
          0,
          1,
          1,
          webgl.RGBA,
          webgl.UNSIGNED_BYTE,
          webglPixel,
        );
        return {
          events,
          application2dPixel: Array.from(
            context2d.getImageData(0, 0, 1, 1).data,
          ),
          applicationWebglPixel: Array.from(webglPixel),
        };
      });
      await recordPage.close();

      expect(recorded.application2dPixel).toEqual([255, 0, 0, 255]);
      expect(recorded.applicationWebglPixel).toEqual([0, 128, 0, 255]);
      const canvasEvents = recorded.events.filter(
        (event) => event.type === 3 && event.data?.source === 9,
      );
      expect(canvasEvents.length).toBeGreaterThanOrEqual(2);
      for (const event of canvasEvents) {
        expect(event.data).toMatchObject({
          source: 9,
          type: 0,
          commands: [{ property: 'clearRect' }, { property: 'drawImage' }],
        });
      }

      await writeFile(artifactPath, JSON.stringify(recorded.events), 'utf8');
      const persistedEvents = JSON.parse(
        await readFile(artifactPath, 'utf8'),
      ) as unknown[];
      expect(persistedEvents).toHaveLength(recorded.events.length);

      const replayPage = await browser.newPage();
      await replayPage.setContent(
        '<!doctype html><html><body><div id="replay-root"></div></body></html>',
      );
      await replayPage.addScriptTag({ path: candidateBundle });
      const replayedPixels = await replayPage.evaluate(async (events) => {
        type ReplayerShape = {
          on: (event: string, callback: () => void) => void;
          play: () => void;
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
        };
        const root = document.querySelector('#replay-root') as HTMLElement;
        const replayer = new pageWindow.rrweb.Replayer(events, {
          root,
          UNSAFE_replayCanvas: true,
          showWarning: false,
          speed: 100,
        });
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('candidate Canvas replay did not finish')),
            10_000,
          );
          replayer.on('finish', () => {
            clearTimeout(timeout);
            resolve();
          });
          replayer.play();
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const replayDocument =
          replayer.iframe?.contentDocument ||
          root.querySelector<HTMLIFrameElement>('iframe')?.contentDocument;
        if (!replayDocument) throw new Error('candidate replay iframe missing');

        const read2dPixel = (selector: string) => {
          const canvas = replayDocument.querySelector(selector);
          if (canvas?.tagName !== 'CANVAS') {
            throw new Error(`replayed canvas missing: ${selector}`);
          }
          const context = (canvas as HTMLCanvasElement).getContext('2d');
          if (!context) {
            throw new Error(`replayed 2D context missing: ${selector}`);
          }
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        const result = {
          canvas2d: read2dPixel('#junify-candidate-2d'),
          webglSnapshot: read2dPixel('#junify-candidate-webgl'),
        };
        replayer.destroy();
        return result;
      }, persistedEvents);
      await replayPage.close();

      expect(replayedPixels.canvas2d).toEqual([255, 0, 0, 255]);
      expect(replayedPixels.webglSnapshot).toEqual([0, 128, 0, 255]);
    } finally {
      await browser.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

describe('junify.privacy candidate persisted artifact', () => {
  it('keeps configured privacy sentinels out of a temporary real-browser artifact', async () => {
    const chromeExecutable =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const candidateBundle = path.join(
      packageRoot,
      '..',
      'rrweb',
      'dist',
      'rrweb.umd.cjs',
    );
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'junify-privacy-artifact-'),
    );
    const artifactPath = path.join(temporaryDirectory, 'events.json');
    const nonce = randomUUID();
    const sentinels = {
      initial: `hidden-initial-${nonce}-1`,
      attribute: `hidden-attribute-${nonce}-22`,
      input: `hidden-input-${nonce}-333`,
      added: `hidden-added-${nonce}-4444`,
      placeholderInitial: `placeholder-initial-${nonce}-55555`,
      placeholderMutation: `placeholder-mutation-${nonce}-666666`,
      placeholderAdded: `placeholder-added-${nonce}-7777777`,
      autocompleteInitial: `autocomplete-initial-${nonce}-88888888`,
      autocompleteAttribute: `autocomplete-attribute-${nonce}-999999999`,
      autocompleteInput: `autocomplete-input-${nonce}-aaaaaaaaaa`,
      autocompleteAdded: `autocomplete-added-${nonce}-bbbbbbbbbbb`,
      passwordInitial: `password-initial-${nonce}-cccccccccccc`,
      passwordValueBeforeType: `password-value-before-type-${nonce}-ddddddddddddd`,
      passwordTypeBeforeValue: `password-type-before-value-${nonce}-eeeeeeeeeeeeee`,
      passwordSyncInput: `password-sync-input-${nonce}-fffffffffffffff`,
    };

    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body>
        <input id="hidden-private" type="hidden" value="${sentinels.initial}">
        <input id="placeholder-private" type="password" placeholder="${sentinels.placeholderInitial}">
        <input id="autocomplete-private" type="text" autocomplete="section-checkout Current-Password" value="${sentinels.autocompleteInitial}">
        <input id="password-initial" type="password" value="${sentinels.passwordInitial}">
        <input id="password-value-before-type" type="password" value="">
        <input id="password-type-before-value" type="password" value="">
        <input id="password-sync-input" type="password" value="">
      </body></html>`);
      await page.addScriptTag({ path: candidateBundle });
      const events = await page.evaluate(async (values) => {
        const pageWindow = window as typeof window & {
          rrweb: {
            record: (
              options: Record<string, unknown>,
            ) => (() => void) | undefined;
          };
        };
        const recorded: unknown[] = [];
        const stop = pageWindow.rrweb.record({
          emit: (event: unknown) => recorded.push(event),
          maskInputOptions: {
            hidden: true,
            password: true,
            textarea: true,
          },
          maskInputFn: (value: string, element: HTMLElement) =>
            element.id.startsWith('autocomplete')
              ? value
              : '*'.repeat(value.length),
        });
        await new Promise((resolve) => setTimeout(resolve, 40));

        const hidden = document.querySelector(
          '#hidden-private',
        ) as HTMLInputElement;
        hidden.setAttribute('value', values.attribute);
        document
          .querySelector('#placeholder-private')
          ?.setAttribute('placeholder', values.placeholderMutation);
        document
          .querySelector('#autocomplete-private')
          ?.setAttribute('value', values.autocompleteAttribute);
        await new Promise((resolve) => setTimeout(resolve, 20));
        hidden.value = values.input;
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        const autocomplete = document.querySelector(
          '#autocomplete-private',
        ) as HTMLInputElement;
        autocomplete.value = values.autocompleteInput;
        autocomplete.dispatchEvent(new Event('input', { bubbles: true }));

        const added = document.createElement('input');
        added.id = 'hidden-added';
        added.type = 'hidden';
        added.value = values.added;
        document.body.append(added);
        const addedTextarea = document.createElement('textarea');
        addedTextarea.id = 'placeholder-added';
        addedTextarea.placeholder = values.placeholderAdded;
        document.body.append(addedTextarea);
        const addedAutocomplete = document.createElement('input');
        addedAutocomplete.id = 'autocomplete-added';
        addedAutocomplete.autocomplete = 'section-payment CC-NUMBER';
        addedAutocomplete.value = values.autocompleteAdded;
        document.body.append(addedAutocomplete);

        const valueBeforeType = document.querySelector(
          '#password-value-before-type',
        ) as HTMLInputElement;
        valueBeforeType.setAttribute('value', values.passwordValueBeforeType);
        valueBeforeType.setAttribute('type', 'text');
        const typeBeforeValue = document.querySelector(
          '#password-type-before-value',
        ) as HTMLInputElement;
        typeBeforeValue.setAttribute('type', 'text');
        typeBeforeValue.setAttribute('value', values.passwordTypeBeforeValue);
        const syncInput = document.querySelector(
          '#password-sync-input',
        ) as HTMLInputElement;
        syncInput.type = 'text';
        syncInput.value = values.passwordSyncInput;
        syncInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
        stop?.();
        return recorded;
      }, sentinels);
      await page.close();

      await writeFile(artifactPath, JSON.stringify(events), 'utf8');
      const persistedPayload = await readFile(artifactPath, 'utf8');
      expect(
        events.some((event) => (event as { type?: number }).type === 2),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            (event as { type?: number; data?: { source?: number } }).type ===
              3 &&
            [0, 5].includes(
              (event as { data?: { source?: number } }).data?.source ?? -1,
            ),
        ),
      ).toBe(true);
      for (const secret of Object.values(sentinels)) {
        expect(persistedPayload).not.toContain(secret);
        expect(persistedPayload).toContain('*'.repeat(secret.length));
      }
    } finally {
      await browser.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
