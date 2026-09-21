import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { vi } from 'vitest';
import {
  assertSnapshot,
  startServer,
  getServerURL,
  launchPuppeteer,
  waitForRAF,
  waitForIFrameLoad,
  replaceLast,
  generateRecordSnippet,
  ISuite,
} from './utils';
import type { recordOptions } from '../src/types';
import {
  eventWithTime,
  NodeType,
  EventType,
  IncrementalSource,
} from '@rrweb/types';
import { visitSnapshot } from 'rrweb-snapshot';

describe('record integration tests', function (this: ISuite) {
  vi.setConfig({ testTimeout: 10_000 });

  const getHtml = (
    fileName: string,
    options: recordOptions<eventWithTime> = {},
  ): string => {
    const filePath = path.resolve(__dirname, `./html/${fileName}`);
    const html = fs.readFileSync(filePath, 'utf8');
    return replaceLast(
      html,
      '</body>',
      `
    <script>
      ${code}
      window.Date.now = () => new Date(Date.UTC(2018, 10, 15, 8)).valueOf();
      ${generateRecordSnippet(options)}
    </script>
    </body>
    `,
    );
  };

  let server: ISuite['server'];
  let serverURL: string;
  let code: ISuite['code'];
  let browser: ISuite['browser'];

  beforeAll(async () => {
    server = await startServer();
    serverURL = getServerURL(server);
    browser = await launchPuppeteer();

    const bundlePath = path.resolve(__dirname, '../dist/rrweb.umd.cjs');
    code = fs.readFileSync(bundlePath, 'utf8');
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  it('can record clicks', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'link.html'));
    await page.click('span');

    // also tap on the span
    const span = await page.waitForSelector('span');
    const center = await page.evaluate((el) => {
      const { x, y, width, height } = el!.getBoundingClientRect();
      return {
        x: Math.round(x + width / 2),
        y: Math.round(y + height / 2),
      };
    }, span);
    await page.touchscreen.tap(center.x, center.y);

    await page.click('a');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can record form interactions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'form.html'));

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('keeps hidden values out of serialized FullSnapshot and IncrementalSnapshot payloads', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const initialSecret = 'hidden-full-secret-001';
    const attributeSecret = 'hidden-attribute-secret-0002';
    const inputSecret = 'hidden-input-secret-00003';
    const addedSecret = 'hidden-added-secret-000004';
    await page.setContent(`<!doctype html><html><body>
      <input id="hidden-private" type="hidden" value="${initialSecret}">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskAllInputs: true,
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({ attributeSecret, addedSecret }) => {
        const hidden = document.querySelector(
          '#hidden-private',
        ) as HTMLInputElement;
        hidden.setAttribute('value', attributeSecret);

        const added = document.createElement('input');
        added.id = 'hidden-added';
        added.type = 'hidden';
        added.value = addedSecret;
        document.body.append(added);
      },
      { attributeSecret, addedSecret },
    );
    await waitForRAF(page);
    await page.evaluate((inputSecret) => {
      const hidden = document.querySelector(
        '#hidden-private',
      ) as HTMLInputElement;
      hidden.value = inputSecret;
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputSecret);
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullSnapshot = events.find(
      (event) => event.type === EventType.FullSnapshot,
    );
    const incrementalSnapshots = events.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        (event.data.source === IncrementalSource.Mutation ||
          event.data.source === IncrementalSource.Input),
    );
    const fullPayload = JSON.stringify(fullSnapshot);
    const incrementalPayload = JSON.stringify(incrementalSnapshots);

    expect(fullSnapshot).toBeDefined();
    expect(incrementalSnapshots.length).toBeGreaterThanOrEqual(2);
    expect(fullPayload).not.toContain(initialSecret);
    expect(fullPayload).toContain('*'.repeat(initialSecret.length));
    for (const secret of [attributeSecret, inputSecret, addedSecret]) {
      expect(incrementalPayload).not.toContain(secret);
      expect(incrementalPayload).toContain('*'.repeat(secret.length));
    }
  });

  it('masks value mutations using hidden and autocomplete states from the same batch', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const hiddenValueBeforeType = 'hidden-value-before-type-001';
    const hiddenTypeBeforeValue = 'hidden-type-before-value-0002';
    const autocompleteValueBeforeRemoval =
      'autocomplete-value-before-removal-00003';
    const autocompleteRemovalBeforeValue =
      'autocomplete-removal-before-value-000004';
    const visibleControl = 'normal-text-value-control-0000005';
    await page.setContent(`<!doctype html><html><body>
      <input id="hidden-value-before-type" type="hidden" value="">
      <input id="hidden-type-before-value" type="hidden" value="">
      <input id="autocomplete-value-before-removal" type="text" autocomplete="current-password" value="">
      <input id="autocomplete-removal-before-value" type="text" autocomplete="cc-number" value="">
      <input id="normal-text-control" type="text" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { hidden: true },
        maskInputFn: (value, element) =>
          element.id.startsWith('autocomplete')
            ? value
            : '*'.repeat(value.length),
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({
        hiddenValueBeforeType,
        hiddenTypeBeforeValue,
        autocompleteValueBeforeRemoval,
        autocompleteRemovalBeforeValue,
        visibleControl,
      }) => {
        const hiddenValueFirst = document.querySelector(
          '#hidden-value-before-type',
        ) as HTMLInputElement;
        hiddenValueFirst.setAttribute('value', hiddenValueBeforeType);
        hiddenValueFirst.setAttribute('type', 'text');

        const hiddenTypeFirst = document.querySelector(
          '#hidden-type-before-value',
        ) as HTMLInputElement;
        hiddenTypeFirst.setAttribute('type', 'text');
        hiddenTypeFirst.setAttribute('value', hiddenTypeBeforeValue);

        const autocompleteValueFirst = document.querySelector(
          '#autocomplete-value-before-removal',
        ) as HTMLInputElement;
        autocompleteValueFirst.setAttribute(
          'value',
          autocompleteValueBeforeRemoval,
        );
        autocompleteValueFirst.removeAttribute('autocomplete');

        const autocompleteRemovalFirst = document.querySelector(
          '#autocomplete-removal-before-value',
        ) as HTMLInputElement;
        autocompleteRemovalFirst.removeAttribute('autocomplete');
        autocompleteRemovalFirst.setAttribute(
          'value',
          autocompleteRemovalBeforeValue,
        );

        document
          .querySelector('#normal-text-control')
          ?.setAttribute('value', visibleControl);
      },
      {
        hiddenValueBeforeType,
        hiddenTypeBeforeValue,
        autocompleteValueBeforeRemoval,
        autocompleteRemovalBeforeValue,
        visibleControl,
      },
    );
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullSnapshot = events.find(
      (event) => event.type === EventType.FullSnapshot,
    );
    expect(fullSnapshot?.type).toBe(EventType.FullSnapshot);
    const ids = new Map<string, number>();
    if (fullSnapshot?.type === EventType.FullSnapshot) {
      visitSnapshot(fullSnapshot.data.node, (node) => {
        if (
          node.type === NodeType.Element &&
          typeof node.attributes.id === 'string'
        ) {
          ids.set(node.attributes.id, node.id);
        }
      });
    }
    const attributes = events.flatMap((event) =>
      event.type === EventType.IncrementalSnapshot &&
      event.data.source === IncrementalSource.Mutation
        ? event.data.attributes
        : [],
    );
    const attributesFor = (id: string) =>
      attributes.find((mutation) => mutation.id === ids.get(id))?.attributes;

    const hiddenValueFirst = attributesFor('hidden-value-before-type');
    const hiddenTypeFirst = attributesFor('hidden-type-before-value');
    const autocompleteValueFirst = attributesFor(
      'autocomplete-value-before-removal',
    );
    const autocompleteRemovalFirst = attributesFor(
      'autocomplete-removal-before-value',
    );
    const normalText = attributesFor('normal-text-control');

    expect.soft(hiddenValueFirst).toMatchObject({
      type: 'text',
      value: '*'.repeat(hiddenValueBeforeType.length),
    });
    expect.soft(hiddenTypeFirst).toMatchObject({
      type: 'text',
      value: '*'.repeat(hiddenTypeBeforeValue.length),
    });
    expect.soft(autocompleteValueFirst).toMatchObject({
      autocomplete: null,
      value: '*'.repeat(autocompleteValueBeforeRemoval.length),
    });
    expect.soft(autocompleteRemovalFirst).toMatchObject({
      autocomplete: null,
      value: '*'.repeat(autocompleteRemovalBeforeValue.length),
    });
    expect(normalText).toMatchObject({ value: visibleControl });
    for (const secret of [
      hiddenValueBeforeType,
      hiddenTypeBeforeValue,
      autocompleteValueBeforeRemoval,
      autocompleteRemovalBeforeValue,
    ]) {
      expect(JSON.stringify(attributes)).not.toContain(secret);
    }
  });

  it('masks configured placeholder snapshots and mutations while preserving removal and controls', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const initialSecret = 'placeholder-full-secret-001';
    const attributeSecret = 'placeholder-attribute-secret-0002';
    const addedSecret = 'placeholder-added-secret-00003';
    const visibleControl = 'placeholder-visible-control-000004';
    await page.setContent(`<!doctype html><html><body>
      <input id="placeholder-private" type="password" placeholder="${initialSecret}">
      <input id="placeholder-control" type="text" placeholder="control-initial">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { password: true, textarea: true },
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({ attributeSecret, addedSecret, visibleControl }) => {
        document
          .querySelector('#placeholder-private')
          ?.setAttribute('placeholder', attributeSecret);
        document
          .querySelector('#placeholder-control')
          ?.setAttribute('placeholder', visibleControl);
        const added = document.createElement('textarea');
        added.id = 'placeholder-added';
        added.placeholder = addedSecret;
        document.body.append(added);
      },
      { attributeSecret, addedSecret, visibleControl },
    );
    await waitForRAF(page);
    await page.evaluate(() => {
      document
        .querySelector('#placeholder-private')
        ?.removeAttribute('placeholder');
    });
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullPayload = JSON.stringify(
      events.find((event) => event.type === EventType.FullSnapshot),
    );
    const mutationEvents = events.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        event.data.source === IncrementalSource.Mutation,
    );
    const incrementalPayload = JSON.stringify(mutationEvents);

    expect(fullPayload).not.toContain(initialSecret);
    expect(fullPayload).toContain('*'.repeat(initialSecret.length));
    for (const secret of [attributeSecret, addedSecret]) {
      expect(incrementalPayload).not.toContain(secret);
      expect(incrementalPayload).toContain('*'.repeat(secret.length));
    }
    expect(incrementalPayload).toContain(visibleControl);
    expect(
      mutationEvents.some(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          event.data.source === IncrementalSource.Mutation &&
          event.data.attributes.some(
            ({ attributes }) => attributes.placeholder === null,
          ),
      ),
    ).toBe(true);
  });

  it('forces sensitive autocomplete values out of FullSnapshot, mutation, add, and Input payloads', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const initialSecret = 'autocomplete-full-secret-001';
    const attributeSecret = 'autocomplete-attribute-secret-0002';
    const inputSecret = 'autocomplete-input-secret-00003';
    const addedSecret = 'autocomplete-added-secret-000004';
    const visibleControl = 'autocomplete-name-visible-control-000005';
    await page.setContent(`<!doctype html><html><body>
      <input id="autocomplete-private" type="text" autocomplete="section-checkout SHIPPING Current-Password" value="${initialSecret}">
      <input id="autocomplete-control" type="text" autocomplete="name" value="${visibleControl}">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputFn: (value) => value,
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({ attributeSecret, addedSecret }) => {
        document
          .querySelector('#autocomplete-private')
          ?.setAttribute('value', attributeSecret);
        const added = document.createElement('input');
        added.id = 'autocomplete-added';
        added.autocomplete = 'section-payment CC-CSC';
        added.value = addedSecret;
        document.body.append(added);
      },
      { attributeSecret, addedSecret },
    );
    await waitForRAF(page);
    await page.evaluate((inputSecret) => {
      const input = document.querySelector(
        '#autocomplete-private',
      ) as HTMLInputElement;
      input.value = inputSecret;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputSecret);
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullPayload = JSON.stringify(
      events.find((event) => event.type === EventType.FullSnapshot),
    );
    const incrementalPayload = JSON.stringify(
      events.filter(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          (event.data.source === IncrementalSource.Mutation ||
            event.data.source === IncrementalSource.Input),
      ),
    );

    expect(fullPayload).not.toContain(initialSecret);
    expect(fullPayload).toContain('*'.repeat(initialSecret.length));
    expect(fullPayload).toContain(visibleControl);
    for (const secret of [attributeSecret, inputSecret, addedSecret]) {
      expect(incrementalPayload).not.toContain(secret);
      expect(incrementalPayload).toContain('*'.repeat(secret.length));
    }
  });

  it('masks password value attributes in both same-batch type mutation orders', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const initialSecret = 'password-full-secret-001';
    const valueBeforeTypeSecret = 'password-value-before-type-secret-0002';
    const typeBeforeValueSecret = 'password-type-before-value-secret-00003';
    await page.setContent(`<!doctype html><html><body>
      <input id="password-initial" type="password" value="${initialSecret}">
      <input id="password-value-before-type" type="password" value="">
      <input id="password-type-before-value" type="password" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { password: true },
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({ valueBeforeTypeSecret, typeBeforeValueSecret }) => {
        const valueBeforeType = document.querySelector(
          '#password-value-before-type',
        ) as HTMLInputElement;
        valueBeforeType.setAttribute('value', valueBeforeTypeSecret);
        valueBeforeType.setAttribute('type', 'text');

        const typeBeforeValue = document.querySelector(
          '#password-type-before-value',
        ) as HTMLInputElement;
        typeBeforeValue.setAttribute('type', 'text');
        typeBeforeValue.setAttribute('value', typeBeforeValueSecret);
      },
      { valueBeforeTypeSecret, typeBeforeValueSecret },
    );
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullPayload = JSON.stringify(
      events.find((event) => event.type === EventType.FullSnapshot),
    );
    const mutationPayload = JSON.stringify(
      events.filter(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          event.data.source === IncrementalSource.Mutation,
      ),
    );

    expect(fullPayload).not.toContain(initialSecret);
    expect(fullPayload).toContain('*'.repeat(initialSecret.length));
    for (const secret of [valueBeforeTypeSecret, typeBeforeValueSecret]) {
      expect(mutationPayload).not.toContain(secret);
      expect(mutationPayload).toContain('*'.repeat(secret.length));
    }
  });

  it('masks pre-flush Input events for post-start and temporary password states without stale masking', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const addedBeforeFlushSecret = 'added-password-before-flush-001';
    const addedAfterFlushSecret = 'added-password-after-flush-0000000002';
    const temporaryPasswordSecret = 'temporary-password-before-flush-00003';
    const afterBatchVisible = 'temporary-password-visible-after-batch-000004';
    const ordinaryVisible = 'ordinary-text-input-control-0000005';
    await page.setContent(`<!doctype html><html><body>
      <input id="temporary-password-input" type="text" value="">
      <input id="ordinary-text-input" type="text" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { password: true },
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({ addedBeforeFlushSecret, temporaryPasswordSecret }) => {
        const added = document.createElement('input');
        added.id = 'added-password-input';
        added.type = 'password';
        document.body.append(added);
        added.type = 'text';
        added.value = addedBeforeFlushSecret;
        added.dispatchEvent(new Event('input', { bubbles: true }));

        const temporary = document.querySelector(
          '#temporary-password-input',
        ) as HTMLInputElement;
        temporary.type = 'password';
        temporary.type = 'text';
        temporary.value = temporaryPasswordSecret;
        temporary.dispatchEvent(new Event('input', { bubbles: true }));
      },
      { addedBeforeFlushSecret, temporaryPasswordSecret },
    );
    await waitForRAF(page);

    await page.evaluate(
      ({ addedAfterFlushSecret, afterBatchVisible, ordinaryVisible }) => {
        const added = document.querySelector(
          '#added-password-input',
        ) as HTMLInputElement;
        added.value = addedAfterFlushSecret;
        added.dispatchEvent(new Event('input', { bubbles: true }));
        const temporary = document.querySelector(
          '#temporary-password-input',
        ) as HTMLInputElement;
        temporary.value = afterBatchVisible;
        temporary.dispatchEvent(new Event('input', { bubbles: true }));
        const control = document.querySelector(
          '#ordinary-text-input',
        ) as HTMLInputElement;
        control.value = ordinaryVisible;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      },
      { addedAfterFlushSecret, afterBatchVisible, ordinaryVisible },
    );
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullSnapshot = events.find(
      (event) => event.type === EventType.FullSnapshot,
    );
    expect(fullSnapshot?.type).toBe(EventType.FullSnapshot);
    let temporaryId = -1;
    let ordinaryId = -1;
    if (fullSnapshot?.type === EventType.FullSnapshot) {
      visitSnapshot(fullSnapshot.data.node, (node) => {
        if (node.type !== NodeType.Element) return;
        if (node.attributes.id === 'temporary-password-input') {
          temporaryId = node.id;
        }
        if (node.attributes.id === 'ordinary-text-input') {
          ordinaryId = node.id;
        }
      });
    }
    let addedId = -1;
    for (const event of events) {
      if (
        event.type !== EventType.IncrementalSnapshot ||
        event.data.source !== IncrementalSource.Mutation
      ) {
        continue;
      }
      for (const add of event.data.adds) {
        visitSnapshot(add.node, (node) => {
          if (
            node.type === NodeType.Element &&
            node.attributes.id === 'added-password-input'
          ) {
            addedId = node.id;
          }
        });
      }
    }
    const inputEvents = events.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        event.data.source === IncrementalSource.Input,
    );

    expect(temporaryId).toBeGreaterThan(0);
    expect(ordinaryId).toBeGreaterThan(0);
    expect(addedId).toBeGreaterThan(0);
    expect(JSON.stringify(inputEvents)).not.toContain(addedBeforeFlushSecret);
    expect(JSON.stringify(inputEvents)).not.toContain(temporaryPasswordSecret);
    expect(inputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            id: -1,
            text: '*'.repeat(addedBeforeFlushSecret.length),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            id: addedId,
            text: '*'.repeat(addedAfterFlushSecret.length),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            id: temporaryId,
            text: '*'.repeat(temporaryPasswordSecret.length),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            id: temporaryId,
            text: afterBatchVisible,
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            id: ordinaryId,
            text: ordinaryVisible,
          }),
        }),
      ]),
    );
  });

  it('masks pre-flush Input events for password attribute methods without stale masking', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const addedSetSecret = 'attribute-added-set-password-secret-001';
    const addedRemoveSecret = 'attribute-added-remove-password-secret-0002';
    const assignedSetSecret = 'attribute-assigned-set-password-secret-00003';
    const assignedRemoveSecret =
      'attribute-assigned-remove-password-secret-000004';
    const visibleValues = {
      addedSet: 'attribute-added-set-visible-after-batch-0000005',
      addedRemove: 'attribute-added-remove-visible-after-batch-00000006',
      assignedSet: 'attribute-assigned-set-visible-after-batch-000000007',
      assignedRemove:
        'attribute-assigned-remove-visible-after-batch-0000000008',
      ordinary: 'attribute-method-ordinary-control-visible-00000000009',
    };
    await page.setContent(`<!doctype html><html><body>
      <input id="attribute-assigned-set" type="text" value="">
      <input id="attribute-assigned-remove" type="text" value="">
      <input id="attribute-method-control" type="text" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { password: true },
      });
    });
    await waitForRAF(page);

    await page.evaluate(
      ({
        addedSetSecret,
        addedRemoveSecret,
        assignedSetSecret,
        assignedRemoveSecret,
      }) => {
        const addedSet = document.createElement('input');
        addedSet.id = 'attribute-added-set';
        document.body.append(addedSet);
        addedSet.setAttribute('type', 'password');
        addedSet.setAttribute('type', 'text');
        addedSet.value = addedSetSecret;
        addedSet.dispatchEvent(new Event('input', { bubbles: true }));

        const addedRemove = document.createElement('input');
        addedRemove.id = 'attribute-added-remove';
        document.body.append(addedRemove);
        addedRemove.setAttribute('type', 'password');
        addedRemove.removeAttribute('type');
        addedRemove.value = addedRemoveSecret;
        addedRemove.dispatchEvent(new Event('input', { bubbles: true }));

        const assignedSet = document.querySelector(
          '#attribute-assigned-set',
        ) as HTMLInputElement;
        assignedSet.setAttribute('type', 'password');
        assignedSet.setAttribute('type', 'text');
        assignedSet.value = assignedSetSecret;
        assignedSet.dispatchEvent(new Event('input', { bubbles: true }));

        const assignedRemove = document.querySelector(
          '#attribute-assigned-remove',
        ) as HTMLInputElement;
        assignedRemove.setAttribute('type', 'password');
        assignedRemove.removeAttribute('type');
        assignedRemove.value = assignedRemoveSecret;
        assignedRemove.dispatchEvent(new Event('input', { bubbles: true }));
      },
      {
        addedSetSecret,
        addedRemoveSecret,
        assignedSetSecret,
        assignedRemoveSecret,
      },
    );
    await waitForRAF(page);

    await page.evaluate((visibleValues) => {
      const values = [
        ['#attribute-added-set', visibleValues.addedSet],
        ['#attribute-added-remove', visibleValues.addedRemove],
        ['#attribute-assigned-set', visibleValues.assignedSet],
        ['#attribute-assigned-remove', visibleValues.assignedRemove],
      ] as const;
      values.forEach(([selector, value]) => {
        const input = document.querySelector(selector) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const ordinary = document.querySelector(
        '#attribute-method-control',
      ) as HTMLInputElement;
      ordinary.setAttribute('data-privacy-control', 'unchanged');
      ordinary.setAttribute('type', 'email');
      ordinary.value = visibleValues.ordinary;
      ordinary.dispatchEvent(new Event('input', { bubbles: true }));
    }, visibleValues);
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullSnapshot = events.find(
      (event) => event.type === EventType.FullSnapshot,
    );
    expect(fullSnapshot?.type).toBe(EventType.FullSnapshot);
    const ids = new Map<string, number>();
    if (fullSnapshot?.type === EventType.FullSnapshot) {
      visitSnapshot(fullSnapshot.data.node, (node) => {
        if (
          node.type === NodeType.Element &&
          typeof node.attributes.id === 'string'
        ) {
          ids.set(node.attributes.id, node.id);
        }
      });
    }
    events.forEach((event) => {
      if (
        event.type !== EventType.IncrementalSnapshot ||
        event.data.source !== IncrementalSource.Mutation
      ) {
        return;
      }
      event.data.adds.forEach((add) => {
        visitSnapshot(add.node, (node) => {
          if (
            node.type === NodeType.Element &&
            typeof node.attributes.id === 'string'
          ) {
            ids.set(node.attributes.id, node.id);
          }
        });
      });
    });
    const inputEvents = events.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        event.data.source === IncrementalSource.Input,
    );
    const hasInput = (id: number, text: string) =>
      inputEvents.some(
        (event) => event.data.id === id && event.data.text === text,
      );
    expect.soft(hasInput(-1, '*'.repeat(addedSetSecret.length))).toBe(true);
    expect.soft(hasInput(-1, '*'.repeat(addedRemoveSecret.length))).toBe(true);
    expect
      .soft(
        hasInput(
          ids.get('attribute-assigned-set') as number,
          '*'.repeat(assignedSetSecret.length),
        ),
      )
      .toBe(true);
    expect
      .soft(
        hasInput(
          ids.get('attribute-assigned-remove') as number,
          '*'.repeat(assignedRemoveSecret.length),
        ),
      )
      .toBe(true);
    expect(
      hasInput(
        ids.get('attribute-added-set') as number,
        visibleValues.addedSet,
      ),
    ).toBe(true);
    expect(
      hasInput(
        ids.get('attribute-added-remove') as number,
        visibleValues.addedRemove,
      ),
    ).toBe(true);
    expect(
      hasInput(
        ids.get('attribute-assigned-set') as number,
        visibleValues.assignedSet,
      ),
    ).toBe(true);
    expect(
      hasInput(
        ids.get('attribute-assigned-remove') as number,
        visibleValues.assignedRemove,
      ),
    ).toBe(true);
    expect(
      hasInput(
        ids.get('attribute-method-control') as number,
        visibleValues.ordinary,
      ),
    ).toBe(true);
    for (const secret of [
      addedSetSecret,
      addedRemoveSecret,
      assignedSetSecret,
      assignedRemoveSecret,
    ]) {
      expect.soft(JSON.stringify(inputEvents)).not.toContain(secret);
    }
  });

  it('restores password attribute method hooks across stop and restart', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const restartSecret = 'attribute-method-restart-password-secret-001';
    await page.setContent(`<!doctype html><html><body>
      <input id="attribute-method-restart" type="text" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    const firstCycle = await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        rrweb: typeof import('../src');
      };
      const originalSetAttribute = Element.prototype.setAttribute;
      const originalRemoveAttribute = Element.prototype.removeAttribute;
      const stop = pageWindow.rrweb.record({ emit: () => undefined });
      const setWrapped =
        Element.prototype.setAttribute !== originalSetAttribute;
      const removeWrapped =
        Element.prototype.removeAttribute !== originalRemoveAttribute;
      stop?.();
      stop?.();
      return {
        setWrapped,
        removeWrapped,
        setRestored: Element.prototype.setAttribute === originalSetAttribute,
        removeRestored:
          Element.prototype.removeAttribute === originalRemoveAttribute,
      };
    });
    expect(firstCycle).toEqual({
      setWrapped: true,
      removeWrapped: true,
      setRestored: true,
      removeRestored: true,
    });

    const restartEvents = await page.evaluate(async (restartSecret) => {
      const pageWindow = window as typeof window & {
        rrweb: typeof import('../src');
      };
      const events: eventWithTime[] = [];
      const originalSetAttribute = Element.prototype.setAttribute;
      const originalRemoveAttribute = Element.prototype.removeAttribute;
      const stop = pageWindow.rrweb.record({
        emit: (event) => events.push(event),
        maskInputOptions: { password: true },
      });
      const input = document.querySelector(
        '#attribute-method-restart',
      ) as HTMLInputElement;
      input.setAttribute('type', 'password');
      input.setAttribute('type', 'text');
      input.value = restartSecret;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      stop?.();
      if (
        Element.prototype.setAttribute !== originalSetAttribute ||
        Element.prototype.removeAttribute !== originalRemoveAttribute
      ) {
        throw new Error(
          'attribute method hooks were not restored after restart',
        );
      }
      return events;
    }, restartSecret);
    const restartInputEvents = restartEvents.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        event.data.source === IncrementalSource.Input,
    );
    expect(JSON.stringify(restartInputEvents)).not.toContain(restartSecret);
    expect(JSON.stringify(restartInputEvents)).toContain(
      '*'.repeat(restartSecret.length),
    );

    const preservesLaterPatch = await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        rrweb: typeof import('../src');
      };
      const stop = pageWindow.rrweb.record({ emit: () => undefined });
      const recorderSetAttribute = Element.prototype.setAttribute;
      const recorderRemoveAttribute = Element.prototype.removeAttribute;
      const thirdPartySetAttribute = new Proxy(recorderSetAttribute, {});
      const thirdPartyRemoveAttribute = new Proxy(recorderRemoveAttribute, {});
      Element.prototype.setAttribute = thirdPartySetAttribute;
      Element.prototype.removeAttribute = thirdPartyRemoveAttribute;
      stop?.();
      return (
        Element.prototype.setAttribute === thirdPartySetAttribute &&
        Element.prototype.removeAttribute === thirdPartyRemoveAttribute
      );
    });
    await page.close();
    expect(preservesLaterPatch).toBe(true);
  });

  it('keeps preserved third-party attribute wrappers inert after stop and active after restart', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const visibleAfterFirstStop =
      'attribute-method-visible-after-first-stop-001';
    const restartSecret = 'attribute-method-restart-secret-0002';
    await page.setContent(`<!doctype html><html><body>
      <input id="attribute-method-lifecycle" type="text" value="">
    </body></html>`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ visibleAfterFirstStop, restartSecret }) => {
        const pageWindow = window as typeof window & {
          rrweb: typeof import('../src');
        };
        const input = document.querySelector(
          '#attribute-method-lifecycle',
        ) as HTMLInputElement;
        const stopFirst = pageWindow.rrweb.record({ emit: () => undefined });
        const firstRecorderSetAttribute = Element.prototype.setAttribute;
        const firstRecorderRemoveAttribute = Element.prototype.removeAttribute;
        const thirdPartySetAttribute = new Proxy(firstRecorderSetAttribute, {});
        const thirdPartyRemoveAttribute = new Proxy(
          firstRecorderRemoveAttribute,
          {},
        );
        Element.prototype.setAttribute = thirdPartySetAttribute;
        Element.prototype.removeAttribute = thirdPartyRemoveAttribute;
        stopFirst?.();
        stopFirst?.();
        const thirdPartyPreservedAfterFirstStop =
          Element.prototype.setAttribute === thirdPartySetAttribute &&
          Element.prototype.removeAttribute === thirdPartyRemoveAttribute;

        const nativeSetTimeout = window.setTimeout;
        let firstInactiveScheduled = 0;
        window.setTimeout = new Proxy(nativeSetTimeout, {
          apply(target, thisArg, argumentsList) {
            firstInactiveScheduled += 1;
            return Reflect.apply(target, thisArg, argumentsList);
          },
        });
        input.setAttribute('type', 'password');
        input.removeAttribute('type');
        window.setTimeout = nativeSetTimeout;

        const restartEvents: eventWithTime[] = [];
        const stopRestart = pageWindow.rrweb.record({
          emit: (event) => restartEvents.push(event),
          maskInputOptions: { password: true },
        });
        input.value = visibleAfterFirstStop;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => nativeSetTimeout(resolve, 40));
        input.setAttribute('type', 'password');
        input.setAttribute('type', 'text');
        input.value = restartSecret;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => nativeSetTimeout(resolve, 40));
        stopRestart?.();
        stopRestart?.();
        const thirdPartyPreservedAfterRestart =
          Element.prototype.setAttribute === thirdPartySetAttribute &&
          Element.prototype.removeAttribute === thirdPartyRemoveAttribute;

        let secondInactiveScheduled = 0;
        window.setTimeout = new Proxy(nativeSetTimeout, {
          apply(target, thisArg, argumentsList) {
            secondInactiveScheduled += 1;
            return Reflect.apply(target, thisArg, argumentsList);
          },
        });
        input.setAttribute('type', 'password');
        input.setAttribute('type', 'text');
        window.setTimeout = nativeSetTimeout;

        return {
          firstInactiveScheduled,
          secondInactiveScheduled,
          thirdPartyPreservedAfterFirstStop,
          thirdPartyPreservedAfterRestart,
          restartEvents,
        };
      },
      { visibleAfterFirstStop, restartSecret },
    );
    await page.close();

    expect.soft(result.firstInactiveScheduled).toBe(0);
    expect.soft(result.secondInactiveScheduled).toBe(0);
    expect(result.thirdPartyPreservedAfterFirstStop).toBe(true);
    expect(result.thirdPartyPreservedAfterRestart).toBe(true);
    const fullSnapshot = result.restartEvents.find(
      (event) => event.type === EventType.FullSnapshot,
    );
    expect(fullSnapshot?.type).toBe(EventType.FullSnapshot);
    let inputId = -1;
    if (fullSnapshot?.type === EventType.FullSnapshot) {
      visitSnapshot(fullSnapshot.data.node, (node) => {
        if (
          node.type === NodeType.Element &&
          node.attributes.id === 'attribute-method-lifecycle'
        ) {
          inputId = node.id;
        }
      });
    }
    expect(inputId).toBeGreaterThan(0);
    const restartInputEvents = result.restartEvents.filter(
      (event) =>
        event.type === EventType.IncrementalSnapshot &&
        event.data.source === IncrementalSource.Input &&
        event.data.id === inputId,
    );
    expect
      .soft(
        restartInputEvents.some(
          (event) => event.data.text === visibleAfterFirstStop,
        ),
      )
      .toBe(true);
    expect(
      restartInputEvents.some(
        (event) => event.data.text === '*'.repeat(restartSecret.length),
      ),
    ).toBe(true);
    expect(JSON.stringify(restartInputEvents)).not.toContain(restartSecret);
  });

  it('keeps configured textarea initial, add, attribute, child, and Input values out of payloads', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const initialSecret = 'textarea-full-secret-001';
    const addedSecret = 'textarea-added-secret-0002';
    const attributeSecret = 'textarea-attribute-secret-00003';
    const childSecret = 'textarea-child-secret-000004';
    const inputSecret = 'textarea-input-secret-000005';
    await page.setContent(`<!doctype html><html><body>
      <textarea id="textarea-private">${initialSecret}</textarea>
    </body></html>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(() => {
      const pageWindow = window as typeof window & {
        snapshots?: eventWithTime[];
        rrweb: typeof import('../src');
      };
      pageWindow.snapshots = [];
      pageWindow.rrweb.record({
        emit: (event) => pageWindow.snapshots?.push(event),
        maskInputOptions: { textarea: true },
      });
    });
    await waitForRAF(page);

    await page.evaluate((addedSecret) => {
      const added = document.createElement('textarea');
      added.id = 'textarea-added';
      added.textContent = addedSecret;
      document.body.append(added);
    }, addedSecret);
    await waitForRAF(page);
    await page.evaluate((attributeSecret) => {
      document
        .querySelector('#textarea-private')
        ?.setAttribute('value', attributeSecret);
    }, attributeSecret);
    await waitForRAF(page);
    await page.evaluate((childSecret) => {
      const textarea = document.querySelector(
        '#textarea-private',
      ) as HTMLTextAreaElement;
      textarea.textContent = childSecret;
    }, childSecret);
    await waitForRAF(page);
    await page.evaluate((inputSecret) => {
      const textarea = document.querySelector(
        '#textarea-private',
      ) as HTMLTextAreaElement;
      textarea.value = inputSecret;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputSecret);
    await waitForRAF(page);

    const events = (await page.evaluate('window.snapshots')) as eventWithTime[];
    await page.close();
    const fullPayload = JSON.stringify(
      events.find((event) => event.type === EventType.FullSnapshot),
    );
    const incrementalPayload = JSON.stringify(
      events.filter(
        (event) =>
          event.type === EventType.IncrementalSnapshot &&
          (event.data.source === IncrementalSource.Mutation ||
            event.data.source === IncrementalSource.Input),
      ),
    );

    expect(fullPayload).not.toContain(initialSecret);
    expect(fullPayload).toContain('*'.repeat(initialSecret.length));
    for (const secret of [
      addedSecret,
      attributeSecret,
      childSecret,
      inputSecret,
    ]) {
      expect(incrementalPayload).not.toContain(secret);
      expect(incrementalPayload).toContain('*'.repeat(secret.length));
    }
  });

  it('can record and replay textarea mutations correctly', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'empty.html'));

    await waitForRAF(page); // ensure mutations aren't included in fullsnapshot

    await page.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.innerText = 'pre value';
      document.body.append(ta);

      const ta2 = document.createElement('textarea');
      ta2.id = 'ta2';
      document.body.append(ta2);
    });
    await waitForRAF(page);
    await page.evaluate(() => {
      const t = document.querySelector('textarea') as HTMLTextAreaElement;
      t.innerText = 'ok'; // this mutation should be recorded

      const ta2t = document.createTextNode('added');
      document.getElementById('ta2').append(ta2t);
    });
    await waitForRAF(page);
    await page.evaluate(() => {
      const t = document.querySelector('textarea') as HTMLTextAreaElement;
      (t.childNodes[0] as Text).appendData('3'); // this mutation is also valid

      document.getElementById('ta2').remove(); // done with this
    });
    await waitForRAF(page);
    await page.type('textarea', '1'); // types (inserts) at index 0, in front of existing text
    await waitForRAF(page);
    await page.evaluate(() => {
      const t = document.querySelector('textarea') as HTMLTextAreaElement;
      // user has typed so childNode content should now be ignored
      (t.childNodes[0] as Text).data = 'igno';
      (t.childNodes[0] as Text).appendData('re');
      // this mutation is currently emitted, and shows up in snapshot
      // but we will check that it doesn't have any effect on the value
      // there is nothing explicit in rrweb which enforces this, but this test may protect against
      // a future change where a mutation on a textarea incorrectly updates the .value
    });
    await waitForRAF(page);
    await page.type('textarea', '2'); // cursor is at index 1

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);

    // check after each mutation and text input
    const replayTextareaValues = await page.evaluate(`
      const { Replayer } = rrweb;
      const replayer = new Replayer(window.snapshots);
      const vals = [];
      window.snapshots.filter((e)=>e.data.attributes || e.data.source === 5).forEach((e)=>{
        replayer.pause((e.timestamp - window.snapshots[0].timestamp)+1);
        let ts = replayer.iframe.contentDocument.querySelector('textarea');
        vals.push((e.data.source === 0 ? 'Mutation' : 'User') + ':' + ts.value);
        let ts2 = replayer.iframe.contentDocument.getElementById('ta2');
        if (ts2) {
          vals.push('ta2:' + ts2.value);
        }
      });
      vals;
    `);
    expect(replayTextareaValues).toEqual([
      'Mutation:pre value',
      'ta2:',
      'Mutation:ok',
      'ta2:added',
      'Mutation:ok3',
      'User:1ok3',
      'Mutation:1ok3', // if this gets set to 'ignore', it's an error, as the 'user' has modified the textarea
      'User:12ok3',
    ]);
  });

  it('can record and replay style mutations', async () => {
    // This test shows that the `isStyle` attribute on textContent is not needed in a mutation
    // TODO: we could get a lot more elaborate here with mixed textContent and insertRule mutations
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(getHtml.call(this, 'style.html'));

    await waitForRAF(page); // ensure mutations aren't included in fullsnapshot

    await page.evaluate(() => {
      let styleEl = document.querySelector('style#dual-textContent');
      if (styleEl) {
        styleEl.append(
          document.createTextNode('body { background-color: darkgreen; }'),
        );
        styleEl.append(
          document.createTextNode(
            '.absolutify { background-image: url("./rel"); }',
          ),
        );
      }
    });
    await waitForRAF(page);
    await page.evaluate(() => {
      let styleEl = document.querySelector('style#dual-textContent');
      if (styleEl) {
        styleEl.childNodes.forEach((cn) => {
          if (cn.textContent) {
            cn.textContent = cn.textContent.replace('darkgreen', 'purple');
            cn.textContent = cn.textContent.replace(
              'orange !important',
              'yellow',
            );
          }
        });
      }
    });
    await waitForRAF(page);
    await page.evaluate(() => {
      let styleEl = document.querySelector('style#dual-textContent');
      if (styleEl) {
        styleEl.childNodes.forEach((cn) => {
          if (cn.textContent) {
            cn.textContent = cn.textContent.replace(
              'black',
              'black !important',
            );
          }
        });
      }
      let hoverMutationStyleEl = document.querySelector('style#hover-mutation');
      if (hoverMutationStyleEl) {
        hoverMutationStyleEl.childNodes.forEach((cn) => {
          if (cn.textContent) {
            cn.textContent = 'a:hover { outline: cyan solid 1px; }';
          }
        });
      }
      let st = document.createElement('style');
      st.id = 'goldilocks';
      st.innerText = 'body { color: brown }';
      document.body.append(st);
    });

    await waitForRAF(page);
    await page.evaluate(() => {
      let styleEl = document.querySelector('style#goldilocks');
      if (styleEl) {
        styleEl.childNodes.forEach((cn) => {
          if (cn.textContent) {
            cn.textContent = cn.textContent.replace('brown', 'gold');
          }
        });
      }
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];

    // following ensures that the ./rel url has been absolutized (in a mutation)
    await assertSnapshot(snapshots);

    // check after each mutation and text input
    const replayStyleValues = await page.evaluate(`
      const { Replayer } = rrweb;
      const replayer = new Replayer(window.snapshots);
      const vals = [];
      window.snapshots.filter((e)=>e.data.attributes || e.data.source === 5).forEach((e)=>{
        replayer.pause((e.timestamp - window.snapshots[0].timestamp)+1);
        let bodyStyle = getComputedStyle(replayer.iframe.contentDocument.querySelector('body'))
        vals.push({
          'background-color': bodyStyle['background-color'],
          'color': bodyStyle['color'],
        });
      });
      vals.push(replayer.iframe.contentDocument.getElementById('single-textContent').innerText);
      vals.push(replayer.iframe.contentDocument.getElementById('empty').innerText);
      vals.push(replayer.iframe.contentDocument.getElementById('hover-mutation').innerText);
      vals;
`);

    expect(replayStyleValues).toEqual([
      {
        'background-color': 'rgb(0, 100, 0)', // darkgreen
        color: 'rgb(255, 165, 0)', // orange (from style.html)
      },
      {
        'background-color': 'rgb(128, 0, 128)', // purple
        color: 'rgb(255, 255, 0)', // yellow
      },
      {
        'background-color': 'rgb(0, 0, 0)', // black !important
        color: 'rgb(165, 42, 42)', // brown
      },
      {
        'background-color': 'rgb(0, 0, 0)',
        color: 'rgb(255, 215, 0)', // gold
      },
      'a:hover,\na.\\:hover { outline: red solid 1px; }', // has run adaptCssForReplay
      'a:hover,\na.\\:hover { outline: blue solid 1px; }', // has run adaptCssForReplay
      'a:hover,\na.\\:hover { outline: cyan solid 1px; }', // has run adaptCssForReplay after text mutation
    ]);
  });

  it('can record childList mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      document.body.removeChild(ul);
      const p = document.querySelector('p') as HTMLParagraphElement;
      p.appendChild(document.createElement('span'));
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can record character data muatations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.innerText = 'new list item';
      li.innerText = 'new list item edit';
      document.body.removeChild(ul);
      const p = document.querySelector('p') as HTMLParagraphElement;
      p.innerText = 'mutated';
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can record attribute mutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.setAttribute('foo', 'bar');
      document.body.removeChild(ul);
      document.body.setAttribute('test', 'true');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('handles null attribute values', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html', {}));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);

      li.setAttribute('aria-label', 'label');
      li.setAttribute('id', 'test-li');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    await page.evaluate(() => {
      const li = document.querySelector('#test-li') as HTMLLIElement;
      // This triggers the mutation observer with a `null` attribute value
      li.removeAttribute('aria-label');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can record node mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'select2.html'), {
      waitUntil: 'networkidle0',
    });

    // toggle the select box
    await page.click('.select2-container', { clickCount: 2, delay: 100 });
    // test storage of !important style
    await page.evaluate(
      'document.getElementById("select2-drop").setAttribute("style", document.getElementById("select2-drop").style.cssText + "color:black !important")',
    );
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can record style changes compactly and preserve css var() functions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'), {
      waitUntil: 'networkidle0',
    });

    // goal here is to ensure var(--mystery) ends up in the mutations (CSSOM fails in this case)
    await page.evaluate(
      'document.body.setAttribute("style", "background: var(--mystery)")',
    );
    await waitForRAF(page);
    // and in this change we can't use the shorter styleObj format either
    await page.evaluate(
      'document.body.setAttribute("style", "background: var(--mystery); background-color: black")',
    );

    // reset is always shorter to be recorded as a sting rather than a styleObj
    await page.evaluate('document.body.setAttribute("style", "")');
    await waitForRAF(page);

    await page.evaluate('document.body.setAttribute("style", "display:block")');
    await waitForRAF(page);
    // following should be recorded as an update of `{ color: 'var(--mystery-color)' }` without needing to include the display
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block")',
    );
    await waitForRAF(page);
    // whereas this case, it's shorter to record the entire string than the longhands for margin
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block;margin:10px")',
    );
    await waitForRAF(page);
    // and in this case, it's shorter to record just the change to the longhand margin-left;
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block;margin:10px 10px 10px 0px;")',
    );
    await waitForRAF(page);
    // see what happens when we manipulate the style object directly (expecting a compact mutation with just these two changes)
    await page.evaluate(
      'document.body.style.marginTop = 0; document.body.style.color = null',
    );
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can freeze mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', { recordCanvas: true }),
    );

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.setAttribute('foo', 'bar');
      document.body.setAttribute('test', 'true');
    });
    await page.evaluate('rrweb.freezePage()');
    await page.evaluate(() => {
      document.body.setAttribute('test', 'bad');
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl') as WebGLRenderingContext;
      gl.getExtension('bad');
      const ul = document.querySelector('ul') as HTMLUListElement;
      const li = document.createElement('li');
      li.setAttribute('bad-attr', 'bad');
      li.innerText = 'bad text';
      ul.appendChild(li);
      document.body.removeChild(ul);
    });

    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should not record input events on ignored elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'ignore.html', {
        ignoreSelector: '[data-rr-ignore]',
      }),
    );

    await page.type('.rr-ignore', 'secret');
    await page.type('[data-rr-ignore]', 'secret');
    await page.type('.dont-ignore', 'not secret');

    await assertSnapshot(page);
  });

  it('should not record input values if maskAllInputs is enabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', { maskAllInputs: true }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can use maskInputOptions to configure which type of inputs should be masked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskInputOptions: {
          text: false,
          textarea: false,
          password: true,
        },
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.type('input[type="password"]', 'password');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should mask password value attribute with maskInputOptions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'password.html', {
        maskInputOptions: {
          password: true,
        },
      }),
    );

    await page.type('#password', 'secr3t');

    // Change type to text (simulate "show password")
    await page.click('#show-password');
    await page.type('#password', 'XY');
    await page.click('#show-password');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should mask inputs via function call', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskAllInputs: true,
        maskInputFn: (text: string, element: HTMLElement) => {
          // If the element has the attribute "data-unmask-example", we don't mask it
          if (element.hasAttribute('data-unmask-example')) {
            return text;
          }

          return '*'.repeat(text.length);
        },
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record input userTriggered values if userTriggeredOnInput is enabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', { userTriggeredOnInput: true }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should not record blocked elements and its child nodes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'block.html'));

    await page.type('input', 'should not be record');
    await page.evaluate(`document.getElementById('text').innerText = '1'`);
    await page.click('#text');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should not record blocked elements dynamically added', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'block.html'));

    await page.evaluate(() => {
      const el = document.createElement('button');
      el.className = 'rr-block';
      el.style.width = '100px';
      el.style.height = '100px';
      el.innerText = 'Should not be recorded';

      const nextElement = document.querySelector('.rr-block')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('mutations should work when blocked class is unblocked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about: blank');
    await page.setContent(getHtml.call(this, 'blocked-unblocked.html'));

    const elements1 = (await page.$x(
      '/html/body/div[1]/button',
    )) as puppeteer.ElementHandle<HTMLButtonElement>[];
    await elements1[0].click();

    const elements2 = (await page.$x(
      '/html/body/div[2]/button',
    )) as puppeteer.ElementHandle<HTMLButtonElement>[];
    await elements2[0].click();

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record DOM node movement 1', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'move-node.html'));

    await page.evaluate(() => {
      const div = document.querySelector('div')!;
      const p = document.querySelector('p')!;
      const span = document.querySelector('span')!;
      document.body.removeChild(span);
      p.appendChild(span);
      p.removeChild(span);
      div.appendChild(span);
    });
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record DOM node movement 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'move-node.html'));

    await page.evaluate(() => {
      const div = document.createElement('div');
      const span = document.querySelector('span')!;
      document.body.appendChild(div);
      div.appendChild(span);
    });
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record dynamic CSS changes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'react-styled-components.html'));
    await page.click('.toggle');
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record canvas mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas.html', {
        recordCanvas: true,
      }),
    );
    await page.waitForFunction('window.canvasMutationApplied');
    await waitForRAF(page);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    for (const event of snapshots) {
      if (event.type === EventType.FullSnapshot) {
        visitSnapshot(event.data.node, (n) => {
          if (n.type === NodeType.Element && n.attributes.rr_dataURL) {
            n.attributes.rr_dataURL = `LOOKS LIKE WE COULD NOT GET STABLE BASE64 FROM SAME IMAGE.`;
          }
        });
      }
    }
    await assertSnapshot(snapshots);
  });

  it('should not record input values if dynamically added and maskAllInputs is true', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const inputPropertyValue = 'input attribute mutation should also be masked';
    const textareaPropertyValue =
      'textarea attribute mutation should also be masked';
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: true }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.size = 50;
      el.id = 'input';
      el.value = 'input should be masked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);

      const ta = document.createElement('textarea');
      ta.size = 50;
      ta.id = 'textarea';
      ta.setAttribute('size', '50');
      ta.value = 'textarea should be masked';

      nextElement.parentNode!.insertBefore(ta, nextElement);
    });

    await page.type('#input', 'moo');
    await page.type('#textarea', 'boo');

    await page.evaluate(
      ({ inputPropertyValue, textareaPropertyValue }) => {
        const el = document.querySelector('input');
        el.value = inputPropertyValue;

        const ta = document.querySelector('textarea');
        ta.value = textareaPropertyValue;
      },
      { inputPropertyValue, textareaPropertyValue },
    );
    await page.waitForFunction(
      ({
        inputMask,
        textareaMask,
        incrementalType,
        inputSource,
        mutationSource,
      }) => {
        type RecordedNode = {
          id: number;
          attributes?: { id?: string };
          childNodes?: RecordedNode[];
        };
        type RecordedEvent = {
          type: number;
          data?: {
            source?: number;
            id?: number;
            text?: string;
            adds?: Array<{ node: RecordedNode }>;
          };
        };
        const recorded = (
          window as typeof window & { snapshots?: RecordedEvent[] }
        ).snapshots;
        if (!recorded) return false;
        const ids = new Map<string, number>();
        const visit = (node: RecordedNode): void => {
          if (node.attributes?.id) ids.set(node.attributes.id, node.id);
          node.childNodes?.forEach(visit);
        };
        recorded.forEach((event) => {
          if (
            event.type === incrementalType &&
            event.data?.source === mutationSource
          ) {
            event.data.adds?.forEach((add) => visit(add.node));
          }
        });
        return ['input', 'textarea'].every((nodeId) => {
          const id = ids.get(nodeId);
          const text = nodeId === 'input' ? inputMask : textareaMask;
          return recorded.some(
            (event) =>
              event.type === incrementalType &&
              event.data?.source === inputSource &&
              event.data.id === id &&
              event.data.text === text,
          );
        });
      },
      {},
      {
        inputMask: '*'.repeat(inputPropertyValue.length),
        textareaMask: '*'.repeat(textareaPropertyValue.length),
        incrementalType: EventType.IncrementalSnapshot,
        inputSource: IncrementalSource.Input,
        mutationSource: IncrementalSource.Mutation,
      },
    );

    await page.evaluate(() => {
      const el = document.querySelector('input');
      el.setAttribute(
        'value',
        "input attribute mutation should also be masked (even though the new value doesn't take effect)",
      );

      const ta = document.querySelector('textarea');
      ta.setAttribute(
        'value',
        "textarea attribute mutation should also be masked (even though the new value doesn't take effect)",
      );
    });

    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      ta.innerText =
        'textarea attribute mutation via innerText should also be masked ';
    });

    await assertSnapshot(page);
  });

  it('should record webgl canvas mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas-webgl.html', {
        recordCanvas: true,
      }),
    );
    await page.waitForTimeout(50);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can correctly serialize a shader and multiple webgl contexts', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas-webgl-shader.html', {
        recordCanvas: true,
      }),
    );
    await waitForRAF(page);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('will serialize node before record', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const ul = document.querySelector('ul') as HTMLUListElement;
      let count = 3;
      while (count > 0) {
        count--;
        const li = document.createElement('li');
        ul.appendChild(li);
      }
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('will defer missing next node mutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'shuffle.html'));

    const text = await page.evaluate(() => {
      const els = Array.prototype.slice.call(document.querySelectorAll('li'));
      const parent = document.querySelector('ul')!;
      parent.removeChild(els[3]);
      parent.removeChild(els[2]);
      parent.removeChild(els[1]);
      parent.removeChild(els[0]);
      parent.insertBefore(els[3], els[4]);
      parent.insertBefore(els[2], els[4]);
      parent.insertBefore(els[1], els[4]);
      parent.insertBefore(els[0], els[4]);
      return parent.innerText;
    });

    expect(text).toEqual('4\n3\n2\n1\n5');
  });

  it('should nest record iframe', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(getHtml.call(this, 'main.html'));

    const frameIdTwo = await waitForIFrameLoad(page, '#two');
    const frameIdFour = await waitForIFrameLoad(frameIdTwo, '#four');
    await waitForIFrameLoad(frameIdFour, '#five');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record images with blob url', async () => {
    const page: puppeteer.Page = await browser.newPage();
    page.on('console', (msg) => console.log(msg.text()));
    await page.goto(`${serverURL}/html`);
    page.setContent(
      getHtml.call(this, 'image-blob-url.html', { inlineImages: true }),
    );
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`);
    await page.waitForSelector('img'); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record images inside iframe with blob url', async () => {
    const page: puppeteer.Page = await browser.newPage();
    page.on('console', (msg) => console.log(msg.text()));
    await page.goto(`${serverURL}/html`);
    await page.setContent(
      getHtml.call(this, 'frame-image-blob-url.html', { inlineImages: true }),
    );
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`);
    await page.waitForTimeout(50); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record images inside iframe with blob url after iframe was reloaded', async () => {
    const page: puppeteer.Page = await browser.newPage();
    page.on('console', (msg) => console.log(msg.text()));
    await page.goto(`${serverURL}/html`);
    await page.setContent(
      getHtml.call(this, 'frame2.html', { inlineImages: true }),
    );
    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait for iframe to load
    page.evaluate(() => {
      const iframe = document.querySelector('iframe')!;
      iframe.setAttribute('src', '/html/image-blob-url.html');
    });
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`); // wait for image to get loaded
    await page.waitForTimeout(50); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record shadow DOM', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'shadow-dom.html'));

    await page.evaluate(() => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const el = document.querySelector('.my-element') as HTMLDivElement;
      const shadowRoot = el.shadowRoot as ShadowRoot;
      shadowRoot.appendChild(document.createElement('span'));
      shadowRoot.appendChild(document.createElement('p'));
      sleep(1)
        .then(() => {
          shadowRoot.lastChild!.appendChild(document.createElement('p'));
          return sleep(1);
        })
        .then(() => {
          const firstP = shadowRoot.querySelector('p') as HTMLParagraphElement;
          shadowRoot.removeChild(firstP);
          return sleep(1);
        })
        .then(() => {
          (shadowRoot.lastChild!.childNodes[0] as HTMLElement).innerText = 'hi';
          return sleep(1);
        })
        .then(() => {
          (shadowRoot.lastChild!.childNodes[0] as HTMLElement).innerText =
            '123';
          const nestedShadowElement = shadowRoot.lastChild!
            .childNodes[0] as HTMLElement;
          nestedShadowElement.attachShadow({
            mode: 'open',
          });
          nestedShadowElement.shadowRoot!.appendChild(
            document.createElement('span'),
          );
          (nestedShadowElement.shadowRoot!.lastChild as HTMLElement).innerText =
            'nested shadow dom';
        });
    });
    await page.waitForTimeout(50);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record shadow DOM 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.createElement('div') as HTMLDivElement;
        el.attachShadow({ mode: 'open' });
        (el.shadowRoot as ShadowRoot).appendChild(
          document.createElement('input'),
        );
        setTimeout(() => {
          document.body.append(el);
          resolve(null);
        }, 10);
      });
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record shadow DOM 3', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      const el = document.createElement('div') as HTMLDivElement;
      el.attachShadow({ mode: 'open' });
      (el.shadowRoot as ShadowRoot).appendChild(
        document.createElement('input'),
      );
      document.body.append(el);
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record moved shadow DOM', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.createElement('div') as HTMLDivElement;
        el.attachShadow({ mode: 'open' });
        (el.shadowRoot as ShadowRoot).appendChild(
          document.createElement('input'),
        );
        document.body.append(el);
        setTimeout(() => {
          const newEl = document.createElement('div') as HTMLDivElement;
          document.body.append(newEl);
          newEl.append(el);
          resolve(null);
        }, 50);
      });
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record moved shadow DOM 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      const el = document.createElement('div') as HTMLDivElement;
      el.id = 'el';
      el.attachShadow({ mode: 'open' });
      (el.shadowRoot as ShadowRoot).appendChild(
        document.createElement('input'),
      );
      document.body.append(el);
      (el.shadowRoot as ShadowRoot).appendChild(document.createElement('span'));
      (el.shadowRoot as ShadowRoot).appendChild(document.createElement('p'));
      const newEl = document.createElement('div') as HTMLDivElement;
      newEl.id = 'newEl';
      document.body.append(newEl);
      newEl.append(el);
      const input = el.shadowRoot?.children[0] as HTMLInputElement;
      const span = el.shadowRoot?.children[1] as HTMLSpanElement;
      const p = el.shadowRoot?.children[2] as HTMLParagraphElement;
      input.remove();
      span.append(input);
      p.append(input);
      span.append(input);
      setTimeout(() => {
        p.append(input);
      }, 0);
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record nested iframes and shadow doms', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'frame2.html'));

    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait till browser loaded contents of frame

    await page.evaluate(() => {
      // get contentDocument of iframe five
      const contentDocument1 =
        document.querySelector('iframe')!.contentDocument!;
      // create shadow dom #1
      contentDocument1.body.attachShadow({ mode: 'open' });
      contentDocument1.body.shadowRoot!.appendChild(
        document.createElement('div'),
      );
      const div = contentDocument1.body.shadowRoot!.childNodes[0];
      const iframe = contentDocument1.createElement('iframe');
      // append an iframe to shadow dom #1
      div.appendChild(iframe);
    });

    await waitForRAF(page); // wait till browser loaded contents of frame

    page.evaluate(() => {
      const iframe: HTMLIFrameElement = document
        .querySelector('iframe')!
        .contentDocument!.body.shadowRoot!.querySelector('iframe')!;

      const contentDocument2 = iframe.contentDocument!;
      // create shadow dom #2 in the iframe
      contentDocument2.body.attachShadow({ mode: 'open' });
      contentDocument2.body.shadowRoot!.appendChild(
        document.createElement('span'),
      );
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record mutations in iframes accross pages', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    page.on('console', (msg) => console.log(msg.text()));
    await page.setContent(getHtml.call(this, 'frame2.html'));

    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait for iframe to load

    page.evaluate((serverURL) => {
      const iframe = document.querySelector('iframe')!;
      iframe.setAttribute('src', `${serverURL}/html`); // load new page
    }, serverURL);

    await page.waitForResponse(`${serverURL}/html`); // wait for iframe to load pt1
    await waitForRAF(page); // wait for iframe to load pt2

    await page.evaluate(() => {
      const iframeDocument = document.querySelector('iframe')!.contentDocument!;
      const div = iframeDocument.createElement('div');
      iframeDocument.body.appendChild(div);
    });

    await waitForRAF(page); // wait for snapshot to be updated
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  // https://github.com/webcomponents/polyfills/tree/master/packages/shadydom
  it('should record shadow doms polyfilled by shadydom', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      // insert shadydom script
      replaceLast(
        getHtml.call(this, 'polyfilled-shadowdom-mutation.html'),
        '<head>',
        `
        <head>
        <script>
          // To force ShadyDOM to be used even when native ShadowDOM is available, set the ShadyDOM = {force: true} in a script prior to loading the polyfill.
          window.ShadyDOM = { force: true };
        </script>
        <script src="https://cdn.jsdelivr.net/npm/@webcomponents/shadydom@1.9.0/shadydom.min.js"></script>
    `,
      ),
    );
    await page.evaluate(() => {
      const target3 = document.querySelector('#target3');
      target3?.attachShadow({
        mode: 'open',
      });
      target3?.shadowRoot?.appendChild(document.createElement('span'));
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  // https://github.com/salesforce/lwc/tree/master/packages/%40lwc/synthetic-shadow
  it('should record shadow doms polyfilled by synthetic-shadow', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      // insert lwc's synthetic-shadow script
      replaceLast(
        getHtml.call(this, 'polyfilled-shadowdom-mutation.html'),
        '<head>',
        `
        <head>
        <script>var process = {env: {NODE_ENV: "production"}};</script>
        <script src="https://cdn.jsdelivr.net/npm/@lwc/synthetic-shadow@2.20.3/dist/synthetic-shadow.js"></script>
      `,
      ),
    );
    await page.evaluate(() => {
      const target3 = document.querySelector('#target3');
      // create a shadow dom with synthetic shadow
      // https://github.com/salesforce/lwc/blob/v2.20.3/packages/@lwc/synthetic-shadow/src/faux-shadow/element.ts#L81-L87
      target3?.attachShadow({
        mode: 'open',
        '$$lwc-synthetic-mode': true,
      } as ShadowRootInit);
      target3?.shadowRoot?.appendChild(document.createElement('span'));
      const target4 = document.createElement('div');
      target4.id = 'target4';
      // create a native shadow dom
      document.body.appendChild(target4);
      target4.attachShadow({
        mode: 'open',
      });
      target4.shadowRoot?.appendChild(document.createElement('ul'));
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should mask texts', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '[data-masking="true"]',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should mask texts using maskTextFn', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '[data-masking="true"]',
        maskTextFn: (t: string) => t.replace(/[a-z]/g, '*'),
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should unmask texts using maskTextFn', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '*',
        maskTextFn: (t: string, el: HTMLElement) => {
          return el.matches('[data-unmask-example="true"]')
            ? t
            : t.replace(/[a-z]/g, '*');
        },
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can mask character data mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      const p = document.querySelector('p') as HTMLParagraphElement;
      [li, p].forEach((element) => {
        element.className = 'rr-mask';
      });
      ul.appendChild(li);
      li.innerText = 'new list item';
      p.innerText = 'mutated';
    });

    await page.evaluate(() => {
      // generate a characterData mutation; innerText doesn't do that
      const p = document.querySelector('p') as HTMLParagraphElement;
      (p.childNodes[0] as Text).insertData(0, 'doubly ');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('can mask character data mutations with regexp', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', {
        maskTextClass: /custom/,
      }),
    );

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      const p = document.querySelector('p') as HTMLParagraphElement;
      [ul, p].forEach((element) => {
        element.className = 'custom-mask';
      });
      ul.appendChild(li);
      li.innerText = 'new list item';
      p.innerText = 'mutated';
    });

    await page.evaluate(() => {
      // generate a characterData mutation; innerText doesn't do that
      const li = document.querySelector('li:not(:empty)') as HTMLLIElement;
      (li.childNodes[0] as Text).insertData(0, 'descendent should be masked ');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  it('should record after DOMContentLoaded event', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'blank.html', {
        recordAfter: 'DOMContentLoaded',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);
  });

  /**
   * the regression part of the following is now handled by replayer.test.ts::'can deal with duplicate/conflicting values on style elements'
   * so this test could be dropped if we add more robust mixing of `insertRule` into 'can record and replay style mutations'
   */
  it('should record style mutations and replay them correctly', async () => {
    const page: puppeteer.Page = await browser.newPage();
    const OldColor = 'rgb(255, 0, 0)'; // red color
    const NewColor = 'rgb(255, 255, 0)'; // yellow color

    await page.setContent(
      `
      <!DOCTYPE html><html lang="en">
        <head>
	        <style> 
          </style>
        </head>
        <body>
	        <div id="one"></div>
          <div id="two"></div>
	        <script>
		        document.querySelector("style").sheet.insertRule('#one { color: ${OldColor}; }', 0);
	        </script>
        </body></html>
      `,
    );
    // Start rrweb recording
    await page.evaluate(
      (code, recordSnippet) => {
        const script = document.createElement('script');
        script.textContent = `${code}window.Date.now = () => new Date(Date.UTC(2018, 10, 15, 8)).valueOf();${recordSnippet}`;
        document.head.appendChild(script);
      },
      code,
      generateRecordSnippet({}),
    );

    await page.evaluate(
      async (OldColor, NewColor) => {
        // Create a new style element with the same content as the existing style element and apply it to the #two div element
        const incrementalStyle = document.createElement(
          'style',
        ) as HTMLStyleElement;
        incrementalStyle.textContent = ` \n`;
        document.head.appendChild(incrementalStyle);
        incrementalStyle.sheet!.insertRule(`#two { color: ${OldColor}; }`, 0);

        await new Promise((resolve) =>
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          }),
        );

        // Change the color of the #one div element to yellow as an incremental style mutation
        const styleElement = document.querySelector('style')!;
        (styleElement.sheet!.cssRules[0] as any).style.setProperty(
          'color',
          NewColor,
        );
        // Change the color of the #two div element to yellow as an incremental style mutation
        (incrementalStyle.sheet!.cssRules[0] as any).style.setProperty(
          'color',
          NewColor,
        );
      },
      OldColor,
      NewColor,
    );
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);

    /**
     * Replay the recorded events and check if the style mutation is applied correctly
     */
    const changedColors = await page.evaluate(`
      const { Replayer } = rrweb;
      const replayer = new Replayer(window.snapshots);
      replayer.pause(1000);

      // Get the color of the element after applying the style mutation event
      [
        window.getComputedStyle(
          replayer.iframe.contentDocument.querySelector('#one'),
        ).color,
        window.getComputedStyle(
          replayer.iframe.contentDocument.querySelector('#two'),
        ).color,
      ];
    `);
    expect(changedColors).toEqual([NewColor, NewColor]);
    await page.close();
  });

  it('should record style mutations with multiple child nodes and replay them correctly', async () => {
    // ensure that presence of multiple text nodes doesn't interfere with programmatic insertRule operations

    const page: puppeteer.Page = await browser.newPage();
    const Color = 'rgb(255, 0, 0)'; // red color

    await page.setContent(
      `
      <!DOCTYPE html><html lang="en">
        <head>
	        <style>
          /* hello */
          </style>
        </head>
        <body>
	        <div id="one"></div>
          <div id="two"></div>
	        <script>
		        document.querySelector("style").append(document.createTextNode("/* world */"));
		        document.querySelector("style").sheet.insertRule('#one { color: ${Color}; }', 0);
	        </script>
        </body></html>
      `,
    );
    // Start rrweb recording
    await page.evaluate(
      (code, recordSnippet) => {
        const script = document.createElement('script');
        script.textContent = `${code};${recordSnippet}`;
        document.head.appendChild(script);
      },
      code,
      generateRecordSnippet({}),
    );

    await page.evaluate(async (Color) => {
      // Create a new style element with the same content as the existing style element and apply it to the #two div element
      const incrementalStyle = document.createElement(
        'style',
      ) as HTMLStyleElement;
      incrementalStyle.append(document.createTextNode('/* hello */'));
      incrementalStyle.append(document.createTextNode('/* world */'));
      document.head.appendChild(incrementalStyle);
      incrementalStyle.sheet!.insertRule(`#two { color: ${Color}; }`, 0);
    }, Color);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    await assertSnapshot(snapshots);

    /**
     * Replay the recorded events and check if the style mutation is applied correctly
     */
    const changedColors = await page.evaluate(`
      const { Replayer } = rrweb;
      const replayer = new Replayer(window.snapshots);
      replayer.pause(1000);

      // Get the color of the element after applying the style mutation event
      [
        window.getComputedStyle(
          replayer.iframe.contentDocument.querySelector('#one'),
        ).color,
        window.getComputedStyle(
          replayer.iframe.contentDocument.querySelector('#two'),
        ).color,
      ];
    `);
    expect(changedColors).toEqual([Color, Color]);
    await page.close();
  });
});
