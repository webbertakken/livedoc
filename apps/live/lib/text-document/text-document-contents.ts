// The table of contents in the editor (docs/specs/034-text-documents/links-and-navigation.md "Table of contents"):
// one block of the body, read only, its entries paragraphs drawn as the writing's (their tab stops lead to the page
// numbers); a press selects it whole.
import type { NodeSpec, Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection, Plugin } from 'prosemirror-state';
import { CONTENTS, CONTENTS_ATTRIBUTES, Contents } from '@livedoc/text-documents';
import { nullAttributes } from './text-document-attributes';

/** The node's class. */
export const CONTENTS_CLASS = 'text-document-contents';

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
 */
export function contentsView(node: PmNode): NodeView {
  const dom = document.createElement('nav');
  const draw = (next: PmNode) => {
    for (const [name, value] of Object.entries(drawnAttributes(next)))
      dom.setAttribute(name, value);
  };
  draw(node);
  return {
    dom,
    contentDOM: dom,
    update: (next) => {
      if (next.type !== node.type) return false;
      draw(next);
      return true;
    },
    ignoreMutation: (mutation) => mutation.type === 'attributes' && mutation.target === dom,
  };
}

// Selects the table of contents a press landed on.
const selectWhole = (view: EditorView, _pos: number, node: PmNode, nodePos: number): boolean => {
  if (node.type.name !== CONTENTS) return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
  return true;
};

/**
 * A press anywhere on a table of contents selects it whole, a double or triple one too (a block with content takes no
 * selection by itself, and the browser would select words inside it).
 */
export function contentsPressPlugin(): Plugin {
  return new Plugin({
    props: {
      handleClickOn: selectWhole,
      handleDoubleClickOn: selectWhole,
      handleTripleClickOn: selectWhole,
    },
  });
}
