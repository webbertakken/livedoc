// A suggestion's marks in the editor's schema (docs/specs/034-text-documents/review.md "How a suggestion is kept"): an
// insertion, a deletion and a format change, each holding the live state's mark whole, so binding a state that holds
// them drops nothing. Never inclusive: typing at a suggestion's edge never stretches it. An insertion is underlined and
// a deletion struck through in its author's colour.
import type { Mark, MarkSpec, Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  paperInk,
} from '@livedoc/text-documents';

const HEX = /^#[0-9a-f]{6}$/i;

/** The author's colour drawn for the page's paper; none for a colour that is not one. */
function authorInk(mark: Mark): string | undefined {
  const colour = (mark.attrs as { author?: { colour?: unknown } }).author?.colour;
  return typeof colour === 'string' && HEX.test(colour) ? paperInk(colour) : undefined;
}

function suggestionMark(className: string, line: string | null, extra: string[] = []): MarkSpec {
  return {
    attrs: Object.fromEntries(['id', 'at', 'author', ...extra].map((name) => [name, {}])),
    inclusive: false,
    toDOM: (mark) => {
      const ink = authorInk(mark);
      const style = [ink && `color: ${ink}`, line && `text-decoration-line: ${line}`]
        .filter(Boolean)
        .join('; ');
      const id = (mark.attrs as { id?: unknown }).id;
      return [
        'span',
        { class: className, 'data-suggestion': typeof id === 'string' ? id : '', style },
        0,
      ];
    },
  };
}

export const SUGGESTION_MARK_SPECS: Record<string, MarkSpec> = {
  [INSERTION_MARK]: suggestionMark('text-document-insertion', 'underline'),
  [DELETION_MARK]: suggestionMark('text-document-deletion', 'line-through'),
  [FORMAT_CHANGE_MARK]: suggestionMark('text-document-format-change', null, ['before']),
};

/** A paragraph's suggested break (inserted) or join (deleted), as the pilcrow drawn at the end of the paragraph before. */
export type SuggestedBreak = {
  readonly at: number;
  readonly kind: 'insertion' | 'deletion';
  readonly ink?: string;
};

/** Each suggested break or join in the document: where its pilcrow goes and how it is drawn. */
export function suggestedBreaks(doc: PmNode): SuggestedBreak[] {
  const out: SuggestedBreak[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    for (const kind of [INSERTION_MARK, DELETION_MARK] as const) {
      const mark = node.attrs[kind] as { author?: { colour?: unknown } } | null | undefined;
      if (!mark || pos === 0) continue;
      const colour = mark.author?.colour;
      // The end of the block before it: one position back from the paragraph's start.
      out.push({
        at: pos - 1,
        kind,
        ...(typeof colour === 'string' && HEX.test(colour) ? { ink: paperInk(colour) } : {}),
      });
    }
    return false;
  });
  return out;
}

/** The blocks suggested whole (review.md "Whole blocks"). */
const WHOLE_BLOCKS = new Set(['table', 'section_break', 'table_of_contents']);
/** A table's row, suggested whole, and its cells: a column's are suggested each (review.md "Rows and columns"). */
const ROW = 'table_row';
const CELLS = new Set(['table_cell', 'table_header']);

/** A block suggested whole: where it stands, its element's name, its kind, its suggestion and its author's ink. */
export type SuggestedBlock = {
  readonly from: number;
  readonly to: number;
  readonly name: string;
  readonly kind: 'insertion' | 'deletion';
  readonly id: string;
  readonly ink?: string;
  /** Drawn inside the box rather than around it: a row's or a column's cells, so the grid's lines stay clear. */
  readonly inset?: boolean;
};

/**
 * Each block suggested whole in the document, outermost first; a suggested row as each of its cells (an outline on a
 * table row is not drawn), and a suggested cell itself, both inset.
 */
export function suggestedBlocks(doc: PmNode): SuggestedBlock[] {
  const out: SuggestedBlock[] = [];
  const add = (node: PmNode, from: number, to: number, name: string, inset: boolean) => {
    for (const kind of [INSERTION_MARK, DELETION_MARK] as const) {
      const mark = node.attrs[kind] as { id?: unknown; author?: { colour?: unknown } } | null;
      if (!mark || typeof mark.id !== 'string') continue;
      const colour = mark.author?.colour;
      out.push({
        from,
        to,
        name,
        kind,
        id: mark.id,
        ...(typeof colour === 'string' && HEX.test(colour) ? { ink: paperInk(colour) } : {}),
        ...(inset ? { inset } : {}),
      });
    }
  };
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === ROW)
      node.forEach((cell, offset) => {
        const at = pos + 1 + offset;
        add(node, at, at + cell.nodeSize, ROW, true);
      });
    else if (CELLS.has(name)) add(node, pos, pos + node.nodeSize, name, true);
    else if (WHOLE_BLOCKS.has(name)) add(node, pos, pos + node.nodeSize, name, false);
    else return !node.isInline;
    return true;
  });
  return out;
}

/** A suggested block's outline: solid for an insertion, dashed and struck through for a deletion (default). */
function blockDecoration({ from, to, kind, id, ink, inset }: SuggestedBlock): Decoration {
  const style = [
    `outline: 2px ${kind === 'deletion' ? 'dashed' : 'solid'} ${ink ?? 'currentColor'}`,
    `outline-offset: ${inset ? '-2px' : '2px'}`,
    kind === 'deletion' ? 'text-decoration-line: line-through' : '',
  ]
    .filter(Boolean)
    .join('; ');
  return Decoration.node(from, to, {
    class: `text-document-suggested-block text-document-suggested-block-${kind}`,
    'data-suggestion': id,
    style,
  });
}

function pilcrow(kind: SuggestedBreak['kind'], ink: string | undefined): HTMLElement {
  const span = document.createElement('span');
  span.className = `text-document-suggested-break text-document-suggested-break-${kind}`;
  span.textContent = '¶';
  span.setAttribute('aria-hidden', 'true');
  span.style.textDecorationLine = kind === 'deletion' ? 'line-through' : 'underline';
  if (ink) span.style.color = ink;
  return span;
}

/**
 * Draws each suggested break or join as a pilcrow (review.md "While suggesting", (default)), and each block suggested
 * whole inside its outline (review.md "Whole blocks", (default)).
 */
export function suggestedBreaksPlugin(): Plugin {
  const decorate = (doc: PmNode) =>
    DecorationSet.create(doc, [
      ...suggestedBreaks(doc).map(({ at, kind, ink }) =>
        Decoration.widget(at, () => pilcrow(kind, ink), {
          side: -1,
          key: `${kind}-${at}-${ink ?? ''}`,
        }),
      ),
      ...suggestedBlocks(doc).map(blockDecoration),
    ]);
  return new Plugin({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
    },
    props: { decorations: (state) => suggestionBreaksKey.getState(state) },
    key: suggestionBreaksKey,
  });
}

const suggestionBreaksKey = new PluginKey<DecorationSet>('textDocumentSuggestedBreaks');
