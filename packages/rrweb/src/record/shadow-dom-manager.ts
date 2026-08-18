import type { MutationBufferParam } from '../types';
import type {
  mutationCallBack,
  scrollCallback,
  SamplingStrategy,
} from '@rrweb/types';
import {
  initMutationObserver,
  initScrollObserver,
  initAdoptedStyleSheetObserver,
} from './observer';
import { inDom } from '../utils';
import type { Mirror } from 'rrweb-snapshot';
import { isNativeShadowDom } from 'rrweb-snapshot';
import dom, { patch } from '@rrweb/utils';

type BypassOptions = Omit<
  MutationBufferParam,
  'doc' | 'mutationCb' | 'mirror' | 'shadowDomManager'
> & {
  sampling: SamplingStrategy;
};

export class ShadowDomManager {
  private shadowDoms = new Map<ShadowRoot, () => void>();
  private mutationCb: mutationCallBack;
  private scrollCb: scrollCallback;
  private bypassOptions: BypassOptions;
  private mirror: Mirror;
  private restoreHandlers: (() => void)[] = [];

  constructor(options: {
    mutationCb: mutationCallBack;
    scrollCb: scrollCallback;
    bypassOptions: BypassOptions;
    mirror: Mirror;
  }) {
    this.mutationCb = options.mutationCb;
    this.scrollCb = options.scrollCb;
    this.bypassOptions = options.bypassOptions;
    this.mirror = options.mirror;

    this.init();
  }

  public init() {
    this.reset();
    // Patch 'attachShadow' to observe newly added shadow doms.
    this.restoreHandlers.push(this.patchAttachShadow(Element, document));
  }

  public addShadowRoot(shadowRoot: ShadowRoot, doc: Document) {
    if (!isNativeShadowDom(shadowRoot)) return;
    if (this.shadowDoms.has(shadowRoot)) return;
    const [, mutationObserverCleanup] = initMutationObserver(
      {
        ...this.bypassOptions,
        doc,
        mutationCb: this.mutationCb,
        mirror: this.mirror,
        shadowDomManager: this,
      },
      shadowRoot,
    );
    const scrollCleanup = initScrollObserver({
      ...this.bypassOptions,
      scrollCb: this.scrollCb,
      // https://gist.github.com/praveenpuglia/0832da687ed5a5d7a0907046c9ef1813
      // scroll is not allowed to pass the boundary, so we need to listen the shadow document
      doc: shadowRoot as unknown as Document,
      mirror: this.mirror,
    });
    let adoptedStyleSheetCleanup: () => void = () => undefined;
    // Defer this to avoid adoptedStyleSheet events being created before the full snapshot is created or attachShadow action is recorded.
    const timeout = doc.defaultView?.setTimeout(() => {
      if (
        shadowRoot.adoptedStyleSheets &&
        shadowRoot.adoptedStyleSheets.length > 0
      )
        this.bypassOptions.stylesheetManager.adoptStyleSheets(
          shadowRoot.adoptedStyleSheets,
          this.mirror.getId(dom.host(shadowRoot)),
          shadowRoot,
        );
      adoptedStyleSheetCleanup = initAdoptedStyleSheetObserver(
        {
          mirror: this.mirror,
          stylesheetManager: this.bypassOptions.stylesheetManager,
        },
        shadowRoot,
      );
    }, 0);
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (timeout !== undefined) doc.defaultView?.clearTimeout(timeout);
      const cleanups = [
        mutationObserverCleanup,
        scrollCleanup,
        adoptedStyleSheetCleanup,
        () => this.bypassOptions.stylesheetManager.releaseHost(shadowRoot),
      ];
      cleanups.forEach((handler) => {
        try {
          handler();
        } catch (error) {
          console.warn('[rrweb] Failed to dispose shadow observer', error);
        }
      });
      this.shadowDoms.delete(shadowRoot);
    };
    this.shadowDoms.set(shadowRoot, cleanup);
  }

  public removeShadowRoot(shadowRoot: ShadowRoot) {
    this.shadowDoms.get(shadowRoot)?.();
  }

  /**
   * Monkey patch 'attachShadow' of an IFrameElement to observe newly added shadow doms.
   */
  public observeAttachShadow(
    iframeElement: HTMLIFrameElement,
  ): (() => void) | undefined {
    if (!iframeElement.contentWindow || !iframeElement.contentDocument) return;

    return this.patchAttachShadow(
      (
        iframeElement.contentWindow as Window & {
          Element: { prototype: Element };
        }
      ).Element,
      iframeElement.contentDocument,
    );
  }

  /**
   * Patch 'attachShadow' to observe newly added shadow doms.
   */
  private patchAttachShadow(
    element: {
      prototype: Element;
    },
    doc: Document,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const manager = this;
    return patch(
      element.prototype,
      'attachShadow',
      function (original: (init: ShadowRootInit) => ShadowRoot) {
        return function (this: Element, option: ShadowRootInit) {
          const sRoot = original.call(this, option);
          // For the shadow dom elements in the document, monitor their dom mutations.
          // For shadow dom elements that aren't in the document yet,
          // we start monitoring them once their shadow dom host is appended to the document.
          const shadowRootEl = dom.shadowRoot(this);
          if (shadowRootEl && inDom(this))
            manager.addShadowRoot(shadowRootEl, doc);
          return sRoot;
        };
      },
    );
  }

  public reset() {
    Array.from(this.shadowDoms.values()).forEach((handler) => handler());
    this.restoreHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        //
      }
    });
    this.restoreHandlers = [];
    this.shadowDoms = new Map();
  }
}
