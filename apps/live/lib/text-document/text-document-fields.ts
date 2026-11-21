// A page number or page count drawn (docs/specs/034-text-documents/page-layout.md "Page numbers"): the field shows its
// page's number or the page count, as its decoration tells it; with none (no pages laid out) 1. A header's copy on a
// page is filled with that page's; a header being edited shows its page's.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView, type NodeView } from 'prosemirror-view';
import { FIELD, type FieldKind } from '@livedoc/text-documents';
import { cssText, textDeclarations } from './text-document-style-sheet';
import type { FieldShown } from './pagination/pagination-fields';

/** A page's number and the page count, as fields show them. */
export type PageNumbers = { readonly number: number; readonly count: number };

/** With no pages laid out (pageless, a phone, print layout off), a field shows 1 (default). */
export const NO_PAGES: PageNumbers = { number: 1, count: 1 };

/** The text a field shows. */
export const fieldShows = (field: unknown, numbers: PageNumbers): string =>
  String((field as FieldKind) === 'page-count' ? numbers.count : numbers.number);

const numbersOf = (decorations: readonly Decoration[]): PageNumbers => {
  for (const d of decorations) {
    const shown = (d.spec as Partial<FieldShown>).fieldShown;
    if (shown) return shown;
  }
  return NO_PAGES;
};

/** A field drawn as its page's number or the page count, in its own formatting. */
export function fieldView(
  node: PmNode,
  _view: unknown,
  _getPos: unknown,
  decorations: readonly Decoration[],
): NodeView {
  const dom = document.createElement('span');
  dom.contentEditable = 'false';
  const draw = (field: PmNode, numbers: PageNumbers) => {
    const { field: kind, props } = field.attrs as { field: unknown; props: unknown };
    dom.dataset.field = typeof kind === 'string' ? kind : '';
    const own = props && typeof props === 'object' ? cssText(textDeclarations(props)) : '';
    if (own) dom.setAttribute('style', own);
    else dom.removeAttribute('style');
    dom.textContent = fieldShows(kind, numbers);
  };
  draw(node, numbersOf(decorations));
  return {
    dom,
    update: (next, nextDecorations) => {
      if (next.type !== node.type) return false;
      draw(next, numbersOf(nextDecorations));
      return true;
    },
    ignoreMutation: () => true,
  };
}

/** The node views a text document's editors draw fields with. */
export const FIELD_NODE_VIEWS = { [FIELD]: fieldView };

/** Fills a header's copy on a page with that page's number and the page count. */
export function fillFields(root: HTMLElement, numbers: PageNumbers): void {
  for (const field of root.querySelectorAll<HTMLElement>('[data-field]'))
    field.textContent = fieldShows(field.dataset.field, numbers);
}

const numbersKey = new PluginKey<PageNumbers>('text-document-field-numbers');

/** A header's or footer's own page numbers, set while it is edited (`setFieldNumbers`). */
export function fieldNumbersPlugin(): Plugin<PageNumbers> {
  return new Plugin<PageNumbers>({
    key: numbersKey,
    state: {
      init: () => NO_PAGES,
      apply: (tr, numbers) => (tr.getMeta(numbersKey) as PageNumbers | undefined) ?? numbers,
    },
    props: {
      decorations: (state) => {
        const numbers = numbersKey.getState(state) ?? NO_PAGES;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== FIELD) return;
          const shown: FieldShown = { fieldShown: numbers };
          decorations.push(Decoration.node(pos, pos + 1, {}, shown));
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

/** Tells an editor holding `fieldNumbersPlugin` the page numbers its fields show; nothing when they stand. */
export function setFieldNumbers(view: EditorView, numbers: PageNumbers): void {
  const now = numbersKey.getState(view.state);
  if (!now || (now.number === numbers.number && now.count === numbers.count)) return;
  view.dispatch(view.state.tr.setMeta(numbersKey, numbers));
}

/** The page numbers a page's header or footer box carries (`data-page-number`, `data-page-count`). */
export function numbersOfBox(box: HTMLElement): PageNumbers {
  const number = Number(box.dataset.pageNumber);
  const count = Number(box.dataset.pageCount);
  return {
    number: Number.isFinite(number) && box.dataset.pageNumber ? number : NO_PAGES.number,
    count: Number.isFinite(count) && box.dataset.pageCount ? count : NO_PAGES.count,
  };
}
