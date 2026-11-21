// The body's sections (docs/specs/034-text-documents/page-layout.md "Each page is drawn at its section's setup"): the
// first section's setup is the document's, each later one's its section break's; a section break's own line is the
// last of the section before it. A section whose text area is not the first one's draws its writing at its own width
// and place, from the first section's text area, which the body is laid in; where pages are laid out, a section of
// columns draws its writing at a column's width (page-layout.md "Columns"), each block moved to its column.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Columns, SECTION_BREAK, type LiveHeaders, type PageSetup } from '@livedoc/text-documents';

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

export type BodySections = {
  /** Each section's setup, the first the document's. */
  readonly setups: readonly PageSetup[];
  /** The section each block of the body is in, by its index. */
  readonly sectionOf: readonly number[];
  /** Each section's own headers and footers, as the live state names them (page-layout.md "Headers and footers"). */
  readonly headers: readonly (LiveHeaders | undefined)[];
};

/** The body's sections and the section of each of its blocks; the first section's headers are the document's. */
export function bodySections(
  doc: PmNode,
  first: PageSetup,
  firstHeaders?: LiveHeaders,
): BodySections {
  const setups: PageSetup[] = [first];
  const headers: (LiveHeaders | undefined)[] = [firstHeaders];
  const sectionOf: number[] = [];
  doc.forEach((node) => {
    sectionOf.push(setups.length - 1);
    if (node.type.name !== SECTION_BREAK) return;
    const attrs = node.attrs as { setup: PageSetup | null; headers?: LiveHeaders | null };
    setups.push(attrs.setup ?? setups[setups.length - 1]!);
    headers.push(attrs.headers ?? undefined);
  });
  return { setups, sectionOf, headers };
}

/** The section a place in the body is in. */
export function sectionAt(doc: PmNode, pos: number): number {
  let section = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === SECTION_BREAK && offset + node.nodeSize <= pos) section += 1;
  });
  return section;
}

const textWidth = (setup: PageSetup) => setup.width - setup.margins.left - setup.margins.right;

export type SectionInset = {
  /** A block's width: the text area's, or a column's. */
  readonly width: number;
  readonly shift: number;
  /** Its columns: the whole text width, and from one column's start to the next's. */
  readonly columns?: { readonly textWidth: number; readonly step: number; readonly gap: number };
};

/**
 * Where a section's text area lies from the first section's, pages centred one under another, in CSS pixels: its
 * width and how far right it starts, and with `columns` its columns; null when it is the first's.
 */
export function sectionInset(
  first: PageSetup,
  setup: PageSetup,
  columns = false,
): SectionInset | null {
  // Both pages centred: a narrower page starts half the difference further right.
  const shift = (first.width - setup.width) / 2 + setup.margins.left - first.margins.left;
  const width = textWidth(setup);
  const own = Columns.of(setup);
  if (columns && own.count > 1) {
    const column = Columns.width(setup);
    return {
      width: column * PX_PER_PT,
      shift: shift * PX_PER_PT,
      columns: {
        textWidth: width * PX_PER_PT,
        step: (column + own.gap) * PX_PER_PT,
        gap: own.gap * PX_PER_PT,
      },
    };
  }
  if (width === textWidth(first) && shift === 0) return null;
  return { width: width * PX_PER_PT, shift: shift * PX_PER_PT };
}

// A block's place and width as its decoration gives them.
const insetAttrs = (inset: SectionInset): Record<string, string> => ({
  'data-section-width': '',
  ...(inset.columns ? { 'data-section-columns': '' } : {}),
  style: [
    `--section-width: ${inset.width}px`,
    `--section-shift: ${inset.shift}px`,
    ...(inset.columns
      ? [
          `--section-text-width: ${inset.columns.textWidth}px`,
          `--column-step: ${inset.columns.step}px`,
          `--column-gap: ${inset.columns.gap}px`,
        ]
      : []),
  ].join('; '),
});

/** The decorations that draw each block of a section whose text area is not the first's at its own. */
export function sectionWidths(doc: PmNode, first: PageSetup, columns = false): DecorationSet {
  const { setups, sectionOf } = bodySections(doc, first);
  const insets = setups.map((setup) => sectionInset(first, setup, columns));
  const decorations: Decoration[] = [];
  let index = 0;
  doc.forEach((node, pos) => {
    const inset = insets[sectionOf[index]!];
    index += 1;
    if (!inset) return;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, insetAttrs(inset)));
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const key = new PluginKey<DecorationSet>('textDocumentSectionWidths');

/** Meta: the first section's setup changed; draw the sections again. */
export const SECTIONS_CHANGED = 'textDocumentSectionsChanged';

/** `readColumns`: whether columns are drawn (pages are laid out). */
export function sectionWidthsPlugin(
  readFirst: () => PageSetup,
  readColumns: () => boolean = () => false,
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => sectionWidths(state.doc, readFirst(), readColumns()),
      apply: (tr, set) =>
        tr.docChanged || tr.getMeta(SECTIONS_CHANGED)
          ? sectionWidths(tr.doc, readFirst(), readColumns())
          : set,
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
