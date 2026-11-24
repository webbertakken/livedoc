// A table of contents built from the writing (docs/specs/034-text-documents/links-and-navigation.md "Table of
// contents"): its headings are the outline's within its levels, each gaining an id; an entry is its heading's text,
// then a tab and the page the heading starts on (none With blue links, none pageless), linking to the heading, in its
// level's Contents style. Insert puts one in at the caret; Update rebuilds one where it stands.
import type { Node as PmNode, Schema } from 'prosemirror-model';
import { NodeSelection, type Command, type Transaction } from 'prosemirror-state';
import { CONTENTS, Contents, type ContentsLook, type Style } from '@livedoc/text-documents';
import { caretParagraph } from './text-document-breaks';
import { giveHeadingIdIn, headingIdOf, pendingHeadingId } from './text-document-heading-links';
import { LINK_COLOUR } from './text-document-links';
import { headingLevel } from './text-document-outline';

/** Insert > Table of contents' items, each the look it puts in. */
export const CONTENTS_LOOK_ITEMS: Readonly<Record<string, ContentsLook>> = {
  'toc-plain': 'plain',
  'toc-dotted': 'dotted',
  'toc-links': 'links',
};

/** Each look's name, as Insert and the options panel say it. */
export const CONTENTS_LOOK_LABELS: Readonly<Record<ContentsLook, string>> = {
  plain: 'Plain text',
  dotted: 'Dotted',
  links: 'With blue links',
};

/**
 * The pages entries are numbered by: as laid out (each block's shown page number), none (pageless), or not drawn on
 * this screen (a phone), where an entry keeps the number it had.
 */
export type ContentsPages =
  | { readonly kind: 'laid'; readonly pageOfBlock: (block: number) => number }
  | { readonly kind: 'pageless' }
  | { readonly kind: 'unseen' };

/** What building one reads: the styles headings are read through, the pages, the text width and each level's style. */
export type ContentsBuild = {
  readonly styles: readonly Style[];
  readonly pages: ContentsPages;
  /** The width entries' page numbers are put at, in points. */
  readonly textWidth: number;
  readonly styleOf: (level: number) => string | null;
};

export type ContentsHeading = {
  /** Where its paragraph starts. */
  readonly pos: number;
  /** Its index among the body's blocks. */
  readonly block: number;
  readonly level: number;
  readonly text: string;
  readonly id: string | null;
};

/** The outline's headings of levels 1 up to `levels`, in the order written; one with no text is left out. */
export function contentsHeadings(
  doc: PmNode,
  styles: readonly Style[],
  levels: number,
): ContentsHeading[] {
  const headings: ContentsHeading[] = [];
  doc.forEach((node, pos, block) => {
    const level = headingLevel(node, styles);
    const text = node.textContent.trim();
    if (level === null || level > levels || !text) return;
    headings.push({ pos, block, level, text, id: headingIdOf(node) });
  });
  return headings;
}

// Gives each listed heading without an id its id, the last first so the places before stay where they are.
function giveIds(tr: Transaction, styles: readonly Style[], levels: number): void {
  const missing = contentsHeadings(tr.doc, styles, levels).filter((h) => h.id === null);
  for (const heading of missing.reverse())
    giveHeadingIdIn(tr, heading.pos, pendingHeadingId(tr.doc, heading.pos));
}

const hrefOf = (entry: PmNode): string | null => {
  let href: string | null = null;
  entry.descendants((node) => {
    const link = node.marks.find((m) => m.type.name === 'link');
    const value = (link?.attrs as { href?: unknown } | undefined)?.href;
    if (href === null && typeof value === 'string') href = value;
    return href === null;
  });
  return href;
};

// The page number each entry of a table of contents shows, by the heading it links to.
function pagesShown(block: PmNode | null): Map<string, string> {
  const shown = new Map<string, string>();
  block?.forEach((entry) => {
    const href = hrefOf(entry);
    const text = entry.textContent;
    const tab = text.lastIndexOf('\t');
    if (href?.startsWith('#') && tab !== -1) shown.set(href.slice(1), text.slice(tab + 1));
  });
  return shown;
}

// The block for these headings, each given its id.
function contentsBlock(
  schema: Schema,
  attrs: { look: ContentsLook; levels: number },
  headings: readonly ContentsHeading[],
  build: ContentsBuild,
  before: Map<string, string>,
): PmNode {
  const { look } = attrs;
  // With blue links, each entry in the link look: the link colour, underlined.
  const linkLook =
    look === 'links'
      ? [
          schema.marks.color!.create({ value: LINK_COLOUR }),
          schema.marks.underline!.create({ value: true }),
        ]
      : [];
  const entries = headings.map((heading) => {
    const id = heading.id!;
    const { pages } = build;
    const page =
      look === 'links' || pages.kind === 'pageless'
        ? null
        : pages.kind === 'laid'
          ? String(pages.pageOfBlock(heading.block))
          : (before.get(id) ?? null);
    const stops =
      page === null
        ? null
        : {
            tabStops: [
              {
                position: build.textWidth,
                align: 'end',
                ...(look === 'dotted' ? { leader: 'dot' } : {}),
              },
            ],
          };
    const text = page === null ? heading.text : `${heading.text}\t${page}`;
    return schema.nodes.paragraph!.create(
      { style: build.styleOf(heading.level), props: stops },
      schema.text(text, [schema.marks.link!.create({ href: `#${id}` }), ...linkLook]),
    );
  });
  const content = entries.length > 0 ? entries : [schema.nodes.paragraph!.create()];
  return schema.nodes[CONTENTS]!.create(attrs, content);
}

/** A new look or levels for a table of contents (its options panel). */
export type ContentsChange = { readonly look?: ContentsLook; readonly levels?: number };

/**
 * Rebuilds the table of contents starting at `pos` from the headings and pages as they are now, with `change`'s look and
 * levels where it gives them; false where none starts.
 */
export function rebuildContents(
  pos: number,
  build: ContentsBuild,
  change: ContentsChange = {},
): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (node?.type.name !== CONTENTS) return false;
    if (!dispatch) return true;
    const was = node.attrs as { look: ContentsLook; levels: number };
    const levels = Contents.levelsOf(change.levels ?? was.levels);
    const attrs = { look: change.look ?? was.look, levels };
    const tr = state.tr;
    giveIds(tr, build.styles, levels);
    const at = tr.mapping.map(pos);
    const headings = contentsHeadings(tr.doc, build.styles, levels);
    const next = contentsBlock(state.schema, attrs, headings, build, pagesShown(node));
    if (next.eq(node) && !tr.docChanged) return true;
    const selected = state.selection instanceof NodeSelection && state.selection.from === pos;
    tr.replaceWith(at, at + node.nodeSize, next);
    if (selected) tr.setSelection(NodeSelection.create(tr.doc, at));
    dispatch(tr);
    return true;
  };
}

/**
 * Puts a table of contents of `look` (all levels) in at the caret, in the body's own paragraphs (never a table's), a
 * selection deleted first: before the caret's paragraph at its start, after it at its end, else splitting it; selected.
 */
export function insertContents(look: ContentsLook, build: ContentsBuild): Command {
  return (state, dispatch) => {
    const place = caretParagraph(state);
    if (!place || place.tr.selection.$from.depth !== 1) return false;
    if (!dispatch) return true;
    const { tr } = place;
    const levels = Contents.levelsOf(undefined);
    const steps = tr.steps.length;
    const caret = tr.selection.from;
    giveIds(tr, build.styles, levels);
    const headings = contentsHeadings(tr.doc, build.styles, levels);
    const block = contentsBlock(state.schema, { look, levels }, headings, build, new Map());
    // Before an id given at the caret (a heading's start), so the id stays in its heading.
    const $caret = tr.doc.resolve(tr.mapping.slice(steps).map(caret, -1));
    let at: number;
    if ($caret.parentOffset === 0) at = $caret.before();
    else if ($caret.parentOffset === $caret.parent.content.size) at = $caret.after();
    else {
      tr.split($caret.pos);
      // Between the halves: the first closes where the caret was.
      at = $caret.pos + 1;
    }
    tr.insert(at, block);
    tr.setSelection(NodeSelection.create(tr.doc, at));
    dispatch(tr.scrollIntoView());
    return true;
  };
}
