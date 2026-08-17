export const HISTORICAL_SCENARIO = 'historical-comprehensive-v1';
export const LARGE_SNAPSHOT_SCENARIO = 'large-css-full-snapshot-v1';
export const LARGE_CSS_BYTES = 13_600_000;

export const privacySentinels = {
  password: 'JUNIFY_SYNTHETIC_PASSWORD_SECRET_V1',
  textarea: 'JUNIFY_SYNTHETIC_TEXTAREA_SECRET_V1',
  placeholder: 'JUNIFY_SYNTHETIC_PLACEHOLDER_SECRET_V1',
  dynamicPassword: 'JUNIFY_SYNTHETIC_DYNAMIC_PASSWORD_SECRET_V1',
  hidden: 'JUNIFY_SYNTHETIC_HIDDEN_SECRET_V1',
  autocomplete: 'JUNIFY_SYNTHETIC_AUTOCOMPLETE_SECRET_V1',
} as const;

type UnknownRecord = Record<string, unknown>;
type ScenarioCoverage = Record<
  string,
  { observed: boolean; eventIndexes: number[] }
>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function findSerializedElementId(
  value: unknown,
  elementId: string,
): number | undefined {
  if (!isRecord(value)) return undefined;
  const attributes = value.attributes;
  if (
    isRecord(attributes) &&
    attributes.id === elementId &&
    typeof value.id === 'number'
  ) {
    return value.id;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findSerializedElementId(item, elementId);
        if (found !== undefined) return found;
      }
    } else if (isRecord(child)) {
      const found = findSerializedElementId(child, elementId);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function indexesMatching(
  events: unknown[],
  predicate: (event: unknown, json: string) => boolean,
): number[] {
  return events.flatMap((event, index) => {
    const json = JSON.stringify(event);
    return predicate(event, json) ? [index] : [];
  });
}

function coverage(eventIndexes: number[]) {
  return { observed: eventIndexes.length > 0, eventIndexes };
}

function targetTextMutationIndexes(
  events: unknown[],
  elementId: string,
  expectedText: string,
): number[] {
  const targetId = events
    .filter((event) => isRecord(event) && event.type === 2)
    .map((event) => findSerializedElementId(event, elementId))
    .find((id) => id !== undefined);
  if (targetId === undefined) return [];
  return indexesMatching(events, (event) => {
    if (
      !isRecord(event) ||
      event.type !== 3 ||
      !isRecord(event.data) ||
      event.data.source !== 0 ||
      !Array.isArray(event.data.adds)
    ) {
      return false;
    }
    return event.data.adds.some(
      (mutation) =>
        isRecord(mutation) &&
        mutation.parentId === targetId &&
        isRecord(mutation.node) &&
        mutation.node.textContent === expectedText,
    );
  });
}

export function inspectScenarioCoverage(
  events: unknown[],
  scenario: string,
): ScenarioCoverage {
  if (scenario === LARGE_SNAPSHOT_SCENARIO) {
    return {
      largeCssFullSnapshot: coverage(
        indexesMatching(events, (event) => {
          if (!isRecord(event) || event.type !== 2 || !isRecord(event.data)) {
            return false;
          }
          try {
            return (
              Buffer.byteLength(extractLargeSnapshotCss([event])) ===
              LARGE_CSS_BYTES
            );
          } catch {
            return false;
          }
        }),
      ),
    };
  }
  if (scenario !== HISTORICAL_SCENARIO) {
    throw new Error(`Unknown compatibility scenario: ${scenario}`);
  }

  const dynamicInputId = events
    .filter((event) => isRecord(event) && event.type === 2)
    .map((event) =>
      findSerializedElementId(event, 'junify-dynamic-password-v1'),
    )
    .find((id) => id !== undefined);
  const dynamicTypeIndexes = indexesMatching(events, (event) => {
    if (
      dynamicInputId === undefined ||
      !isRecord(event) ||
      event.type !== 3 ||
      !isRecord(event.data) ||
      event.data.source !== 0 ||
      !Array.isArray(event.data.attributes)
    ) {
      return false;
    }
    return event.data.attributes.some(
      (mutation) =>
        isRecord(mutation) &&
        mutation.id === dynamicInputId &&
        isRecord(mutation.attributes) &&
        mutation.attributes.type === 'password',
    );
  });
  const seekBeforeIndexes = targetTextMutationIndexes(
    events,
    'junify-seek-v1',
    'junify-seek-before-v1',
  );
  const seekAfterIndexes = targetTextMutationIndexes(
    events,
    'junify-seek-v1',
    'junify-seek-after-v1',
  );

  return {
    domMutation: coverage(
      targetTextMutationIndexes(
        events,
        'junify-dom-v1',
        'junify-dom-mutated-v1',
      ),
    ),
    spaPushState: coverage(
      targetTextMutationIndexes(
        events,
        'junify-spa-v1',
        'junify-spa-push-state-v1',
      ),
    ),
    spaPopstate: coverage(
      targetTextMutationIndexes(
        events,
        'junify-spa-v1',
        'junify-spa-popstate-v1',
      ),
    ),
    shadowDom: coverage(
      targetTextMutationIndexes(
        events,
        'junify-shadow-marker-v1',
        'junify-shadow-mutated-v1',
      ),
    ),
    password: coverage(
      indexesMatching(events, (_event, json) =>
        json.includes('junify-password-v1'),
      ),
    ),
    textarea: coverage(
      indexesMatching(events, (_event, json) =>
        json.includes('junify-textarea-v1'),
      ),
    ),
    placeholder: coverage(
      indexesMatching(events, (_event, json) =>
        json.includes('junify-placeholder-v1'),
      ),
    ),
    dynamicPasswordType: coverage(dynamicTypeIndexes),
    stylesheetReplace: coverage(
      indexesMatching(events, (event) => {
        if (!isRecord(event) || event.type !== 3 || !isRecord(event.data)) {
          return false;
        }
        return (
          event.data.source === 8 &&
          typeof event.data.replace === 'string' &&
          event.data.replace.includes('junify-replace-async-v1')
        );
      }),
    ),
    stylesheetReplaceSync: coverage(
      indexesMatching(events, (event) => {
        if (!isRecord(event) || event.type !== 3 || !isRecord(event.data)) {
          return false;
        }
        return (
          event.data.source === 8 &&
          typeof event.data.replaceSync === 'string' &&
          event.data.replaceSync.includes('junify-replace-sync-v1')
        );
      }),
    ),
    stylesheetEmptyReplacement: coverage(
      indexesMatching(events, (event) => {
        if (!isRecord(event) || event.type !== 3 || !isRecord(event.data)) {
          return false;
        }
        return (
          event.data.source === 8 &&
          (event.data.replace === '' || event.data.replaceSync === '')
        );
      }),
    ),
    canvas2d: coverage(
      indexesMatching(events, (event) => {
        if (!isRecord(event) || event.type !== 3 || !isRecord(event.data)) {
          return false;
        }
        return event.data.source === 9 && event.data.type === 0;
      }),
    ),
    webgl: coverage(
      indexesMatching(events, (event) => {
        if (!isRecord(event) || event.type !== 3 || !isRecord(event.data)) {
          return false;
        }
        return (
          event.data.source === 9 &&
          (event.data.type === 1 || event.data.type === 2)
        );
      }),
    ),
    seekReadyMutations: {
      observed: seekBeforeIndexes.length > 0 && seekAfterIndexes.length > 0,
      eventIndexes: [...seekBeforeIndexes, ...seekAfterIndexes].sort(
        (left, right) => left - right,
      ),
    },
  };
}

function findLargeCssString(value: unknown): string | undefined {
  if (
    typeof value === 'string' &&
    value.startsWith(':root { --junify-large-css-00000: ')
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLargeCssString(item);
      if (found) return found;
    }
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) {
      const found = findLargeCssString(child);
      if (found) return found;
    }
  }
  return undefined;
}

export function extractLargeSnapshotCss(events: unknown[]): string {
  for (const event of events) {
    if (isRecord(event) && event.type === 2) {
      const css = findLargeCssString(event.data);
      if (css) return css;
    }
  }
  throw new Error('13.6 MB deterministic CSS was not found in a FullSnapshot');
}

export function createLargeCss(): string {
  const rules: string[] = [];
  let remaining = LARGE_CSS_BYTES;
  let index = 0;
  while (remaining > 0) {
    const prefix = `:root { --junify-large-css-${String(index).padStart(
      5,
      '0',
    )}: `;
    const suffix = '; }';
    const overhead = Buffer.byteLength(prefix + suffix);
    if (remaining < overhead) {
      throw new Error('Large CSS remainder cannot form a complete rule');
    }
    const fillerLength =
      remaining <= overhead + 2_000 ? remaining - overhead : 1_000;
    rules.push(`${prefix}${'x'.repeat(fillerLength)}${suffix}`);
    remaining -= overhead + fillerLength;
    index += 1;
  }
  const css = rules.join('');
  if (Buffer.byteLength(css) !== LARGE_CSS_BYTES) {
    throw new Error(
      'Large CSS generator did not produce the exact byte target',
    );
  }
  return css;
}

export function historicalScenarioHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Junify synthetic rrweb compatibility scenario</title>
    <style>body{margin:0}canvas{width:4px;height:4px}</style>
  </head>
  <body>
    <main id="junify-scenario-root-v1">
      <div id="junify-dom-v1">junify-dom-initial-v1</div>
      <div id="junify-seek-v1">junify-seek-initial-v1</div>
      <div id="junify-spa-v1">junify-spa-initial-v1</div>
      <div id="junify-shadow-host-v1"></div>
      <input id="junify-password-v1" type="password" value="${privacySentinels.password}">
      <textarea id="junify-textarea-v1">${privacySentinels.textarea}</textarea>
      <input id="junify-placeholder-v1" type="password" placeholder="${privacySentinels.placeholder}">
      <input id="junify-dynamic-password-v1" type="text" value="">
      <input id="junify-hidden-v1" type="hidden" value="${privacySentinels.hidden}">
      <input id="junify-autocomplete-v1" type="text" autocomplete="current-password" value="${privacySentinels.autocomplete}">
      <div class="junify-replace-sync-v1 junify-replace-async-v1">stylesheet target</div>
      <canvas id="junify-canvas-2d-v1" width="4" height="4"></canvas>
      <canvas id="junify-canvas-webgl-v1" width="4" height="4"></canvas>
    </main>
  </body>
</html>`;
}

export function largeSnapshotHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style id="junify-large-style-v1">${createLargeCss()}</style></head><body><div id="junify-large-css-v1">large snapshot</div></body></html>`;
}

export async function runHistoricalScenarioInPage(
  sentinels: typeof privacySentinels,
): Promise<unknown[]> {
  const pageWindow = window as typeof window & {
    rrweb: {
      record: (options: Record<string, unknown>) => (() => void) | undefined;
      addCustomEvent: (tag: string, payload: unknown) => void;
    };
  };
  const events: unknown[] = [];
  const shadowHost = document.querySelector('#junify-shadow-host-v1');
  if (!(shadowHost instanceof HTMLElement))
    throw new Error('shadow host missing');
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  const shadowMarker = document.createElement('span');
  shadowMarker.id = 'junify-shadow-marker-v1';
  shadowMarker.textContent = 'junify-shadow-initial-v1';
  shadowRoot.append(shadowMarker);

  const stop = pageWindow.rrweb.record({
    emit: (event: unknown) => events.push(event),
    recordCanvas: true,
    collectFonts: false,
    maskInputOptions: { password: true, textarea: true },
    sampling: { canvas: 'all' },
  });
  if (!stop)
    throw new Error('producer record() did not return a stop function');
  const wait = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  const mark = (name: string) =>
    pageWindow.rrweb.addCustomEvent('junify-scenario-v1', { name });

  await wait(40);
  const dom = document.querySelector('#junify-dom-v1');
  const seek = document.querySelector('#junify-seek-v1');
  const spa = document.querySelector('#junify-spa-v1');
  if (!(dom instanceof HTMLElement) || !(seek instanceof HTMLElement)) {
    throw new Error('scenario DOM missing');
  }
  dom.textContent = 'junify-dom-mutated-v1';
  seek.textContent = 'junify-seek-before-v1';
  await wait(20);
  mark('junify-seek-before-v1');

  history.pushState({ synthetic: true }, '', '/spa/next');
  if (spa instanceof HTMLElement) spa.textContent = 'junify-spa-push-state-v1';
  await wait(20);
  mark('junify-spa-push-state-v1');
  await wait(30);
  const popstate = new Promise<void>((resolve) => {
    addEventListener('popstate', () => resolve(), { once: true });
  });
  history.back();
  await popstate;
  if (spa instanceof HTMLElement) spa.textContent = 'junify-spa-popstate-v1';
  await wait(20);
  mark('junify-spa-popstate-v1');

  shadowMarker.textContent = 'junify-shadow-mutated-v1';

  const password = document.querySelector('#junify-password-v1');
  const textarea = document.querySelector('#junify-textarea-v1');
  const placeholder = document.querySelector('#junify-placeholder-v1');
  const dynamicPassword = document.querySelector('#junify-dynamic-password-v1');
  if (
    !(password instanceof HTMLInputElement) ||
    !(textarea instanceof HTMLTextAreaElement) ||
    !(placeholder instanceof HTMLInputElement) ||
    !(dynamicPassword instanceof HTMLInputElement)
  ) {
    throw new Error('privacy scenario controls missing');
  }
  password.value = `${sentinels.password}_MUTATED`;
  password.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.value = `${sentinels.textarea}_MUTATED`;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  placeholder.setAttribute('placeholder', `${sentinels.placeholder}_MUTATED`);
  dynamicPassword.type = 'password';
  dynamicPassword.value = sentinels.dynamicPassword;
  dynamicPassword.dispatchEvent(new Event('input', { bubbles: true }));

  const sheet = new CSSStyleSheet();
  // eslint-disable-next-line compat/compat -- this Chromium-only fixture intentionally characterizes constructable stylesheets
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  sheet.replaceSync('.junify-replace-sync-v1{color:rgb(17,34,51)}');
  mark('junify-replace-sync-v1');
  await wait(20);
  await sheet.replace('.junify-replace-async-v1{background:rgb(51,68,85)}');
  mark('junify-replace-async-v1');
  await wait(20);
  sheet.replaceSync('');
  mark('junify-stylesheet-empty-replace-sync-v1');

  const canvas2d = document.querySelector('#junify-canvas-2d-v1');
  const canvasWebgl = document.querySelector('#junify-canvas-webgl-v1');
  if (!(canvas2d instanceof HTMLCanvasElement))
    throw new Error('2D canvas missing');
  if (!(canvasWebgl instanceof HTMLCanvasElement))
    throw new Error('WebGL canvas missing');
  const context2d = canvas2d.getContext('2d');
  if (!context2d) throw new Error('Canvas2D unavailable');
  context2d.fillStyle = '#112233';
  context2d.fillRect(0, 0, canvas2d.width, canvas2d.height);
  mark('junify-canvas-2d-v1');

  const webgl =
    canvasWebgl.getContext('webgl', { preserveDrawingBuffer: true }) ||
    canvasWebgl.getContext('experimental-webgl', {
      preserveDrawingBuffer: true,
    });
  if (!(webgl instanceof WebGLRenderingContext))
    throw new Error('WebGL unavailable');
  webgl.clearColor(0.2, 0.4, 0.6, 1);
  webgl.clear(webgl.COLOR_BUFFER_BIT);
  mark('junify-canvas-webgl-v1');

  await wait(80);
  seek.textContent = 'junify-seek-after-v1';
  await wait(20);
  mark('junify-seek-after-v1');
  await wait(120);
  stop();
  return events;
}
