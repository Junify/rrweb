import { stringifyRule } from 'rrweb-snapshot';
import type {
  elementNode,
  serializedNodeWithId,
  adoptedStyleSheetCallback,
  adoptedStyleSheetParam,
  attributeMutation,
  mutationCallBack,
} from '@rrweb/types';
import { StyleSheetMirror } from '../utils';

export class StylesheetManager {
  private trackedLinkElements: WeakSet<HTMLLinkElement> = new WeakSet();
  private mutationCb: mutationCallBack;
  private adoptedStyleSheetCb: adoptedStyleSheetCallback;
  public styleMirror = new StyleSheetMirror();
  private hostSheets = new Map<Document | ShadowRoot, Set<CSSStyleSheet>>();
  private sheetOwners = new Map<CSSStyleSheet, number>();

  constructor(options: {
    mutationCb: mutationCallBack;
    adoptedStyleSheetCb: adoptedStyleSheetCallback;
  }) {
    this.mutationCb = options.mutationCb;
    this.adoptedStyleSheetCb = options.adoptedStyleSheetCb;
  }

  public attachLinkElement(
    linkEl: HTMLLinkElement,
    childSn: serializedNodeWithId,
  ) {
    if ('_cssText' in (childSn as elementNode).attributes)
      this.mutationCb({
        adds: [],
        removes: [],
        texts: [],
        attributes: [
          {
            id: childSn.id,
            attributes: (childSn as elementNode)
              .attributes as attributeMutation['attributes'],
          },
        ],
      });

    this.trackLinkElement(linkEl);
  }

  public trackLinkElement(linkEl: HTMLLinkElement) {
    if (this.trackedLinkElements.has(linkEl)) return;

    this.trackedLinkElements.add(linkEl);
    this.trackStylesheetInLinkElement(linkEl);
  }

  public adoptStyleSheets(
    sheets: CSSStyleSheet[] | readonly CSSStyleSheet[],
    hostId: number,
    host: Document | ShadowRoot,
  ) {
    const previousSheets = this.hostSheets.get(host) || new Set();
    const nextSheets = new Set(sheets);
    previousSheets.forEach((sheet) => {
      if (!nextSheets.has(sheet)) this.releaseSheet(sheet);
    });
    nextSheets.forEach((sheet) => {
      if (!previousSheets.has(sheet)) {
        this.sheetOwners.set(sheet, (this.sheetOwners.get(sheet) || 0) + 1);
      }
    });
    if (nextSheets.size) this.hostSheets.set(host, nextSheets);
    else this.hostSheets.delete(host);

    const adoptedStyleSheetData: adoptedStyleSheetParam = {
      id: hostId,
      styleIds: [] as number[],
    };
    const styles: NonNullable<adoptedStyleSheetParam['styles']> = [];
    for (const sheet of sheets) {
      let styleId;
      if (!this.styleMirror.has(sheet)) {
        styleId = this.styleMirror.add(sheet);
        styles.push({
          styleId,
          rules: Array.from(sheet.rules || CSSRule, (r, index) => ({
            rule: stringifyRule(r, sheet.href),
            index,
          })),
        });
      } else styleId = this.styleMirror.getId(sheet);
      adoptedStyleSheetData.styleIds.push(styleId);
    }
    if (styles.length > 0) adoptedStyleSheetData.styles = styles;
    this.adoptedStyleSheetCb(adoptedStyleSheetData);
  }

  public releaseHost(host: Document | ShadowRoot | null | undefined) {
    if (!host) return;
    const sheets = this.hostSheets.get(host);
    this.hostSheets.delete(host);
    sheets?.forEach((sheet) => this.releaseSheet(sheet));
  }

  private releaseSheet(sheet: CSSStyleSheet) {
    const owners = this.sheetOwners.get(sheet) || 0;
    if (owners > 1) {
      this.sheetOwners.set(sheet, owners - 1);
      return;
    }
    this.sheetOwners.delete(sheet);
    this.styleMirror.remove(sheet);
  }

  public reset() {
    this.styleMirror.reset();
    this.trackedLinkElements = new WeakSet();
    this.hostSheets.clear();
    this.sheetOwners.clear();
  }

  // TODO: take snapshot on stylesheet reload by applying event listener
  private trackStylesheetInLinkElement(_linkEl: HTMLLinkElement) {
    // linkEl.addEventListener('load', () => {
    //   // re-loaded, maybe take another snapshot?
    // });
  }
}
