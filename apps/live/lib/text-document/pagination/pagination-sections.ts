// The body's sections (docs/specs/034-text-documents/page-layout.md "Each page is drawn at its section's setup"): the
// first section's setup is the document's, each later one's its section break's; a section break's own line is the
// last of the section before it. A section whose text area is not the first one's draws its writing at its own width
// and place, from the first section's text area, which the body is laid in.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { SECTION_BREAK, type PageSetup } from '@livedoc/text-documents';

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

export type BodySections = {
  /** Each section's setup, the first the document's. */
  readonly setups: readonly PageSetup[];
  /** The section each block of the body is in, by its index. */
  readonly sectionOf: readonly number[];
};

/** The body's sections and the section of each of its blocks. */
export function bodySections(doc: PmNode, first: PageSetup): BodySections {
  const setups: PageSetup[] = [first];
  const sectionOf: number[] = [];
  doc.forEach((node) => {
    sectionOf.push(setups.length - 1);
    if (node.type.name === SECTION_BREAK)
      setups.push((node.attrs as { setup: PageSetup | null }).setup ?? setups[setups.length - 1]!);
  });
  return { setups, sectionOf };
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

/**
 * Where a section's text area lies from the first section's, pages centred one under another, in CSS pixels: its
 * width and how far right it starts; null when it is the first's.
 */
export function sectionInset(
  first: PageSetup,
  setup: PageSetup,
): { width: number; shift: number } | null {
  // Both pages centred: a narrower page starts half the difference further right.
  const shift = (first.width - setup.width) / 2 + setup.margins.left - first.margins.left;
  const width = textWidth(setup);
  if (width === textWidth(first) && shift === 0) return null;
  return { width: width * PX_PER_PT, shift: shift * PX_PER_PT };
}

/** The decorations that draw each block of a section whose text area is not the first's at its own. */
export function sectionWidths(doc: PmNode, first: PageSetup): DecorationSet {
  const { setups, sectionOf } = bodySections(doc, first);
  const insets = setups.map((setup) => sectionInset(first, setup));
  const decorations: Decoration[] = [];
  let index = 0;
  doc.forEach((node, pos) => {
    const inset = insets[sectionOf[index]!];
    index += 1;
    if (!inset) return;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        'data-section-width': '',
        style: `--section-width: ${inset.width}px; --section-shift: ${inset.shift}px`,
      }),
    );
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const key = new PluginKey<DecorationSet>('textDocumentSectionWidths');

/** Meta: the first section's setup changed; draw the sections again. */
export const SECTIONS_CHANGED = 'textDocumentSectionsChanged';

export function sectionWidthsPlugin(readFirst: () => PageSetup): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => sectionWidths(state.doc, readFirst()),
      apply: (tr, set) =>
        tr.docChanged || tr.getMeta(SECTIONS_CHANGED) ? sectionWidths(tr.doc, readFirst()) : set,
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
