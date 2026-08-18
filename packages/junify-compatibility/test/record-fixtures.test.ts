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
    const candidateBundle =
      process.env.JUNIFY_RRWEB_CANDIDATE_BUNDLE ||
      path.join(packageRoot, '..', 'rrweb', 'dist', 'rrweb.umd.cjs');
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'junify-privacy-artifact-'),
    );
    const artifactPath = path.join(temporaryDirectory, 'events.json');
    const nonce = randomUUID();
    const sentinelLengths = {
      initial: 101,
      attribute: 103,
      input: 107,
      added: 109,
      placeholderInitial: 113,
      placeholderMutation: 127,
      placeholderAdded: 131,
      autocompleteInitial: 137,
      autocompleteAttribute: 139,
      autocompleteInput: 149,
      autocompleteAdded: 151,
      passwordInitial: 157,
      passwordValueBeforeType: 163,
      passwordTypeBeforeValue: 167,
      passwordAddedBeforeFlush: 173,
      passwordAddedAfterFlush: 179,
      passwordTemporaryBeforeFlush: 181,
      textareaInitial: 191,
      textareaAdded: 193,
      textareaAttribute: 197,
      textareaChild: 199,
      textareaInput: 211,
      hiddenValueBeforeType: 223,
      hiddenTypeBeforeValue: 227,
      autocompleteValueBeforeRemoval: 229,
      autocompleteRemovalBeforeValue: 233,
    } as const;
    const makeSentinel = (name: string, length: number) => {
      const prefix = `${name}-${nonce}-`;
      if (prefix.length >= length) throw new Error(`${name} is too long`);
      return prefix + 'x'.repeat(length - prefix.length);
    };
    const sentinels = Object.fromEntries(
      Object.entries(sentinelLengths).map(([name, length]) => [
        name,
        makeSentinel(name, length),
      ]),
    ) as { [K in keyof typeof sentinelLengths]: string };
    const visibleValues = {
      passwordTemporaryAfterBatch:
        'temporary-password-normal-after-batch-visible',
      normalText: 'ordinary-normal-text-control-visible',
    };
    expect(
      new Set(Object.values(sentinels).map((value) => value.length)).size,
    ).toBe(Object.keys(sentinels).length);

    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body>
        <input id="hidden-private" type="hidden" value="${sentinels.initial}">
        <input id="placeholder-private" type="password" placeholder="${sentinels.placeholderInitial}">
        <input id="autocomplete-private" type="text" autocomplete="section-checkout Current-Password" value="${sentinels.autocompleteInitial}">
        <input id="password-initial" type="password" value="${sentinels.passwordInitial}">
        <input id="password-value-before-type" type="password" value="">
        <input id="password-type-before-value" type="password" value="">
        <input id="password-temporary" type="text" value="">
        <input id="hidden-value-before-type" type="hidden" value="">
        <input id="hidden-type-before-value" type="hidden" value="">
        <input id="autocomplete-value-before-removal" type="text" autocomplete="current-password" value="">
        <input id="autocomplete-removal-before-value" type="text" autocomplete="cc-number" value="">
        <input id="normal-text-control" type="text" value="">
        <textarea id="textarea-private">${sentinels.textareaInitial}</textarea>
      </body></html>`);
      await page.addScriptTag({ path: candidateBundle });
      const events = await page.evaluate(
        async ({ values, visibleValues }) => {
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
          addedAutocomplete.setAttribute(
            'autocomplete',
            'section-payment CC-NUMBER',
          );
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
          const addedPassword = document.createElement('input');
          addedPassword.id = 'password-added';
          addedPassword.type = 'password';
          document.body.append(addedPassword);
          addedPassword.type = 'text';
          addedPassword.value = values.passwordAddedBeforeFlush;
          addedPassword.dispatchEvent(new Event('input', { bubbles: true }));
          const temporaryPassword = document.querySelector(
            '#password-temporary',
          ) as HTMLInputElement;
          temporaryPassword.type = 'password';
          temporaryPassword.type = 'text';
          temporaryPassword.value = values.passwordTemporaryBeforeFlush;
          temporaryPassword.dispatchEvent(
            new Event('input', { bubbles: true }),
          );

          const hiddenValueFirst = document.querySelector(
            '#hidden-value-before-type',
          ) as HTMLInputElement;
          hiddenValueFirst.setAttribute('value', values.hiddenValueBeforeType);
          hiddenValueFirst.setAttribute('type', 'text');
          const hiddenTypeFirst = document.querySelector(
            '#hidden-type-before-value',
          ) as HTMLInputElement;
          hiddenTypeFirst.setAttribute('type', 'text');
          hiddenTypeFirst.setAttribute('value', values.hiddenTypeBeforeValue);
          const autocompleteValueFirst = document.querySelector(
            '#autocomplete-value-before-removal',
          ) as HTMLInputElement;
          autocompleteValueFirst.setAttribute(
            'value',
            values.autocompleteValueBeforeRemoval,
          );
          autocompleteValueFirst.removeAttribute('autocomplete');
          const autocompleteRemovalFirst = document.querySelector(
            '#autocomplete-removal-before-value',
          ) as HTMLInputElement;
          autocompleteRemovalFirst.removeAttribute('autocomplete');
          autocompleteRemovalFirst.setAttribute(
            'value',
            values.autocompleteRemovalBeforeValue,
          );
          await new Promise((resolve) => setTimeout(resolve, 40));

          addedPassword.value = values.passwordAddedAfterFlush;
          addedPassword.dispatchEvent(new Event('input', { bubbles: true }));
          temporaryPassword.value = visibleValues.passwordTemporaryAfterBatch;
          temporaryPassword.dispatchEvent(
            new Event('input', { bubbles: true }),
          );
          const normalText = document.querySelector(
            '#normal-text-control',
          ) as HTMLInputElement;
          normalText.value = visibleValues.normalText;
          normalText.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 40));

          const addedPrivateTextarea = document.createElement('textarea');
          addedPrivateTextarea.id = 'textarea-private-added';
          addedPrivateTextarea.textContent = values.textareaAdded;
          document.body.append(addedPrivateTextarea);
          await new Promise((resolve) => setTimeout(resolve, 20));
          const privateTextarea = document.querySelector(
            '#textarea-private',
          ) as HTMLTextAreaElement;
          privateTextarea.setAttribute('value', values.textareaAttribute);
          await new Promise((resolve) => setTimeout(resolve, 20));
          privateTextarea.textContent = values.textareaChild;
          await new Promise((resolve) => setTimeout(resolve, 20));
          privateTextarea.value = values.textareaInput;
          privateTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 40));
          stop?.();
          return recorded;
        },
        { values: sentinels, visibleValues },
      );
      await page.close();

      await writeFile(artifactPath, JSON.stringify(events), 'utf8');
      const persistedPayload = await readFile(artifactPath, 'utf8');
      type SerializedNode = {
        type: number;
        id: number;
        attributes?: Record<string, string | boolean | null>;
        childNodes?: SerializedNode[];
      };
      type CandidateEvent = {
        type?: number;
        data?: {
          source?: number;
          node?: SerializedNode;
          adds?: Array<{ node: SerializedNode }>;
          attributes?: Array<{
            id: number;
            attributes: Record<string, string | boolean | null>;
          }>;
          id?: number;
          text?: string;
        };
      };
      const recorded = events as CandidateEvent[];
      const visitNode = (
        node: SerializedNode,
        visit: (candidate: SerializedNode) => void,
      ): void => {
        visit(node);
        node.childNodes?.forEach((child) => visitNode(child, visit));
      };
      const fullSnapshot = recorded.find((event) => event.type === 2);
      expect(fullSnapshot?.data?.node).toBeDefined();
      const fullNodes = new Map<string, SerializedNode>();
      visitNode(fullSnapshot?.data?.node as SerializedNode, (node) => {
        const id = node.attributes?.id;
        if (typeof id === 'string') fullNodes.set(id, node);
      });
      const addedNodes = new Map<string, SerializedNode>();
      for (const event of recorded) {
        if (event.type !== 3 || event.data?.source !== 0) continue;
        for (const add of event.data.adds || []) {
          visitNode(add.node, (node) => {
            const id = node.attributes?.id;
            if (typeof id === 'string') addedNodes.set(id, node);
          });
        }
      }
      const attributeMutations = recorded.flatMap((event) =>
        event.type === 3 && event.data?.source === 0
          ? event.data.attributes || []
          : [],
      );
      const inputEvents = recorded.flatMap((event) =>
        event.type === 3 &&
        event.data?.source === 5 &&
        event.data.id !== undefined
          ? [{ id: event.data.id, text: event.data.text }]
          : [],
      );
      const mask = (name: keyof typeof sentinels) =>
        '*'.repeat(sentinelLengths[name]);
      const fullId = (id: string) => {
        const value = fullNodes.get(id)?.id;
        expect(value, `FullSnapshot node ${id}`).toBeGreaterThan(0);
        return value as number;
      };
      const addedId = (id: string) => {
        const value = addedNodes.get(id)?.id;
        expect(value, `added node ${id}`).toBeGreaterThan(0);
        return value as number;
      };
      const hasMutation = (
        id: number,
        expected: Record<string, string | null>,
        mutations = attributeMutations,
      ) =>
        mutations.some(
          (mutation) =>
            mutation.id === id &&
            Object.entries(expected).every(
              ([name, value]) => mutation.attributes[name] === value,
            ),
        );
      const hasInput = (id: number, text: string, candidates = inputEvents) =>
        candidates.some((event) => event.id === id && event.text === text);

      expect(fullNodes.get('hidden-private')?.attributes?.value).toBe(
        mask('initial'),
      );
      expect(
        fullNodes.get('placeholder-private')?.attributes?.placeholder,
      ).toBe(mask('placeholderInitial'));
      expect(fullNodes.get('autocomplete-private')?.attributes?.value).toBe(
        mask('autocompleteInitial'),
      );
      expect(fullNodes.get('password-initial')?.attributes?.value).toBe(
        mask('passwordInitial'),
      );
      expect(fullNodes.get('textarea-private')?.attributes?.value).toBe(
        mask('textareaInitial'),
      );

      expect(addedNodes.get('hidden-added')?.attributes?.value).toBe(
        mask('added'),
      );
      expect(addedNodes.get('placeholder-added')?.attributes?.placeholder).toBe(
        mask('placeholderAdded'),
      );
      expect(addedNodes.get('autocomplete-added')?.attributes?.value).toBe(
        mask('autocompleteAdded'),
      );
      expect(addedNodes.get('password-added')?.attributes?.value).toBe(
        mask('passwordAddedBeforeFlush'),
      );
      expect(addedNodes.get('textarea-private-added')?.attributes?.value).toBe(
        mask('textareaAdded'),
      );

      const hiddenId = fullId('hidden-private');
      const autocompleteId = fullId('autocomplete-private');
      const temporaryPasswordId = fullId('password-temporary');
      const normalTextId = fullId('normal-text-control');
      const addedPasswordId = addedId('password-added');
      expect(hasMutation(hiddenId, { value: mask('attribute') })).toBe(true);
      expect(
        hasMutation(fullId('placeholder-private'), {
          placeholder: mask('placeholderMutation'),
        }),
      ).toBe(true);
      expect(
        hasMutation(autocompleteId, {
          value: mask('autocompleteAttribute'),
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('password-value-before-type'), {
          value: mask('passwordValueBeforeType'),
          type: 'text',
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('password-type-before-value'), {
          value: mask('passwordTypeBeforeValue'),
          type: 'text',
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('hidden-value-before-type'), {
          value: mask('hiddenValueBeforeType'),
          type: 'text',
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('hidden-type-before-value'), {
          value: mask('hiddenTypeBeforeValue'),
          type: 'text',
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('autocomplete-value-before-removal'), {
          value: mask('autocompleteValueBeforeRemoval'),
          autocomplete: null,
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('autocomplete-removal-before-value'), {
          value: mask('autocompleteRemovalBeforeValue'),
          autocomplete: null,
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('textarea-private'), {
          value: mask('textareaAttribute'),
        }),
      ).toBe(true);
      expect(
        hasMutation(fullId('textarea-private'), {
          value: mask('textareaChild'),
        }),
      ).toBe(true);

      expect(hasInput(hiddenId, mask('input'))).toBe(true);
      expect(hasInput(autocompleteId, mask('autocompleteInput'))).toBe(true);
      expect(hasInput(-1, mask('passwordAddedBeforeFlush'))).toBe(true);
      expect(hasInput(addedPasswordId, mask('passwordAddedAfterFlush'))).toBe(
        true,
      );
      expect(
        hasInput(temporaryPasswordId, mask('passwordTemporaryBeforeFlush')),
      ).toBe(true);
      expect(
        hasInput(
          temporaryPasswordId,
          visibleValues.passwordTemporaryAfterBatch,
        ),
      ).toBe(true);
      expect(hasInput(normalTextId, visibleValues.normalText)).toBe(true);
      expect(hasInput(fullId('textarea-private'), mask('textareaInput'))).toBe(
        true,
      );

      const withoutAddedPasswordAfterFlush = inputEvents.filter(
        (event) =>
          event.id !== addedPasswordId ||
          event.text !== mask('passwordAddedAfterFlush'),
      );
      expect(
        hasInput(
          addedPasswordId,
          mask('passwordAddedAfterFlush'),
          withoutAddedPasswordAfterFlush,
        ),
      ).toBe(false);
      const hiddenBatchId = fullId('hidden-value-before-type');
      const withoutHiddenBatchValue = attributeMutations.filter(
        (mutation) =>
          mutation.id !== hiddenBatchId ||
          mutation.attributes.value !== mask('hiddenValueBeforeType'),
      );
      expect(
        hasMutation(
          hiddenBatchId,
          { value: mask('hiddenValueBeforeType'), type: 'text' },
          withoutHiddenBatchValue,
        ),
      ).toBe(false);
      const autocompleteRemovalId = fullId('autocomplete-value-before-removal');
      const withoutAutocompleteRemovalValue = attributeMutations.filter(
        (mutation) =>
          mutation.id !== autocompleteRemovalId ||
          mutation.attributes.value !== mask('autocompleteValueBeforeRemoval'),
      );
      expect(
        hasMutation(
          autocompleteRemovalId,
          {
            value: mask('autocompleteValueBeforeRemoval'),
            autocomplete: null,
          },
          withoutAutocompleteRemovalValue,
        ),
      ).toBe(false);

      for (const secret of Object.values(sentinels)) {
        expect(persistedPayload).not.toContain(secret);
        expect(persistedPayload).toContain('*'.repeat(secret.length));
      }
      expect(persistedPayload).toContain(
        visibleValues.passwordTemporaryAfterBatch,
      );
      expect(persistedPayload).toContain(visibleValues.normalText);
    } finally {
      await browser.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
