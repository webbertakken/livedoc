// The table of contents in the editor (docs/specs/034-text-documents/links-and-navigation.md "Table of contents"):
// one block of the body, read only, its entries paragraphs drawn as the writing's (their tab stops lead to the page
// numbers); a press selects it whole.
import type { NodeSpec, Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { CONTENTS, CONTENTS_ATTRIBUTES, Contents } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { nullAttributes } from './text-document-attributes';
import { bookmarkPosition } from './text-document-bookmarks';

/** The node's class. */
export const CONTENTS_CLASS = 'text-document-contents';

/** The element its Update and options bar is drawn into while it is selected. */
export const CONTENTS_BAR_HOST = '[data-contents-bar]';

const LOOKS = new Set(['plain', 'dotted', 'links']);

export const contentsNodeSpec: NodeSpec = {
  group: 'block',
  content: 'paragraph+',
  atom: true,
  selectable: true,
  isolating: true,
  attrs: nullAttributes(CONTENTS_ATTRIBUTES),
  parseDOM: [
    {
      tag: `nav.${CONTENTS_CLASS}`,
      getAttrs: (dom) => {
        const look = dom.dataset.look ?? '';
        return {
          look: LOOKS.has(look) ? look : 'plain',
          levels: Contents.levelsOf(Number(dom.dataset.levels)),
        };
      },
    },
  ],
  toDOM: (node) => ['nav', drawnAttributes(node), 0],
};

function drawnAttributes(node: PmNode): Record<string, string> {
  const { look, levels } = node.attrs as { look: unknown; levels: unknown };
  return {
    class: CONTENTS_CLASS,
    'aria-label': 'Table of contents',
    contenteditable: 'false',
    'data-look': typeof look === 'string' ? look : 'plain',
    'data-levels': String(Contents.levelsOf(typeof levels === 'number' ? levels : undefined)),
  };
}

/**
 * The block as the editor draws it: one element kept while it stays a table of contents (a blur or a selection never
 * draws it anew, so its entries' laid-out tabs stay), its look and levels set on it as they change. Its attributes are
 * its own: another hand writing to them (a browser extension, a screenshot tool) never has the editor draw it anew.
 * It holds the host of its Update and options bar, which the editor leaves alone, before its entries.
 */
export function contentsView(node: PmNode): NodeView {
  const dom = document.createElement('nav');
  // The bar's host, above its top-left corner, the bar's own; then its entries.
  const bar = dom.appendChild(document.createElement('div'));
  bar.dataset.contentsBar = '';
  bar.className = 'text-document-contents-bar';
  bar.setAttribute('contenteditable', 'false');
  const entries = dom.appendChild(document.createElement('div'));
  const inBar = (target: EventTarget | Node | null) =>
    target instanceof Node && bar.contains(target);
  // Its class is added, never set: the editor marks it selected by a class of its own.
  const draw = (next: PmNode) => {
    for (const [name, value] of Object.entries(drawnAttributes(next)))
      if (name === 'class') dom.classList.add(value);
      else dom.setAttribute(name, value);
  };
  draw(node);
  return {
    dom,
    contentDOM: entries,
    update: (next) => {
      if (next.type !== node.type) return false;
      draw(next);
      return true;
    },
    ignoreMutation: (mutation) =>
      (mutation.type === 'attributes' && mutation.target === dom) || inBar(mutation.target),
    stopEvent: (event) => inBar(event.target),
  };
}

// The heading an entry links to: the start of the paragraph its bookmark is in; none for an entry linking elsewhere.
function entryHeading(doc: PmNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  if ($pos.parent.type.name !== 'paragraph') return null;
  let href: unknown = null;
  $pos.parent.descendants((child) => {
    href ??= child.marks.find((m) => m.type.name === 'link')?.attrs.href ?? null;
    return href === null;
  });
  if (typeof href !== 'string' || !href.startsWith('#')) return null;
  const at = bookmarkPosition(doc, decodeURIComponent(href.slice(1)));
  return at === null ? null : doc.resolve(at).start();
}

// A press on an entry of a selected table of contents (any, where the writing is read only) goes to its heading.
function followEntry(view: EditorView, pos: number, nodePos: number): boolean {
  const { selection } = view.state;
  const selected = selection instanceof NodeSelection && selection.from === nodePos;
  if (!selected && view.editable) return false;
  const heading = entryHeading(view.state.doc, pos);
  debugLog('[text-document] contents followed', { found: heading !== null });
  if (heading === null) return false;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, heading)).scrollIntoView(),
  );
  view.focus();
  track('UI', 'Used', 'TextDocumentTableOfContentsFollowed');
  return true;
}

// Selects the table of contents a press landed on.
const selectWhole = (view: EditorView, _pos: number, node: PmNode, nodePos: number): boolean => {
  if (node.type.name !== CONTENTS) return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
  return true;
};

/**
 * A press anywhere on a table of contents selects it whole, a double or triple one too; once selected (or where the
 * writing is read only), a press on an entry goes to its heading (a block with content takes no
 * selection by itself, and the browser would select words inside it).
 */
export function contentsPressPlugin(): Plugin {
  return new Plugin({
    props: {
      handleClickOn: (view, pos, node, nodePos) =>
        node.type.name === CONTENTS &&
        (followEntry(view, pos, nodePos) || selectWhole(view, pos, node, nodePos)),
      handleDoubleClickOn: selectWhole,
      handleTripleClickOn: selectWhole,
    },
  });
}

/** Alt+F10 on a selected table of contents goes to its bar's first button, while one is drawn (an Editor's). */
export function contentsBarKeys(): Plugin {
  return keymap({
    'Alt-F10': (state, _dispatch, view) => {
      const { selection } = state;
      if (!view || !(selection instanceof NodeSelection) || selection.node.type.name !== CONTENTS)
        return false;
      const dom = view.nodeDOM(selection.from);
      const button =
        dom instanceof HTMLElement
          ? dom.querySelector<HTMLElement>(`${CONTENTS_BAR_HOST} button`)
          : null;
      button?.focus();
      return button !== null;
    },
  });
}
