// The table of contents in the editor (docs/specs/034-text-documents/links-and-navigation.md "Table of contents"):
// one block of the body, read only, its entries paragraphs drawn as the writing's (their tab stops lead to the page
// numbers); a press selects it whole.
import type { NodeSpec } from 'prosemirror-model';
import { CONTENTS_ATTRIBUTES, Contents } from '@livedoc/text-documents';
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
        const look = (dom as HTMLElement).dataset.look ?? '';
        return {
          look: LOOKS.has(look) ? look : 'plain',
          levels: Contents.levelsOf(Number((dom as HTMLElement).dataset.levels)),
        };
      },
    },
  ],
  toDOM: (node) => {
    const { look, levels } = node.attrs as { look: unknown; levels: unknown };
    return [
      'nav',
      {
        class: CONTENTS_CLASS,
        'aria-label': 'Table of contents',
        contenteditable: 'false',
        'data-look': typeof look === 'string' ? look : 'plain',
        'data-levels': String(Contents.levelsOf(typeof levels === 'number' ? levels : undefined)),
      },
      0,
    ];
  },
};
