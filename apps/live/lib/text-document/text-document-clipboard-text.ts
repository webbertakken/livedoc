// The clipboard's plain text (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): copied, a line per
// paragraph, a list item after its marker as drawn; pasted, a paragraph per line in the formatting at the caret.
import { Fragment, Slice, type Node as PmNode, type ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  CHECK_MARKS,
  FOOTNOTE,
  ListMarkers,
  type ListMarker,
  type ListPlace,
} from '@livedoc/text-documents';
import { placeOf, type Lists } from './text-document-lists';

// Characters no paragraph holds: controls other than the tab (line ends are split into paragraphs first).
const isHeld = (character: string) => {
  const code = character.charCodeAt(0);
  return code === 9 || (code >= 32 && code !== 127);
};

const markerText = (marker: ListMarker): string =>
  marker.kind === 'check' ? (marker.checked ? CHECK_MARKS.done : CHECK_MARKS.open) : marker.text;

/** The markers of the top-level nodes a selection's slice holds, as drawn in the whole document. */
export function selectionMarkers(state: EditorState, lists: Lists): (ListMarker | null)[] {
  const { doc, selection } = state;
  // Several stretches are copied as their text alone.
  if (selection.ranges.length > 1) return [];
  const markers = ListMarkers.of(
    doc.children.map((node) => placeOf(node) ?? undefined),
    lists,
  );
  return markers.slice(selection.$from.index(0), selection.$to.index(0) + 1);
}

/**
 * A slice as plain text: a line per paragraph, a whole list item after its marker, a footnote's mark its number (by
 * its story); a table's rows a line each, cells by tabs; kept content and breaks none.
 */
export function plainTextOf(
  slice: Slice,
  markers: readonly (ListMarker | null)[] = [],
  noteNumbers: ReadonlyMap<string, number> = new Map(),
): string {
  const leaf = (node: PmNode): string =>
    node.type.name === FOOTNOTE
      ? String(noteNumbers.get(String((node.attrs as { story: unknown }).story)) ?? '')
      : (node.type.spec.leafText?.(node) ?? '');
  const lines: string[] = [];
  const textOf = (node: PmNode) => node.textBetween(0, node.content.size, ' ', leaf);
  // A table's rows a line each, its cells by tabs (tables.md "In the editor"); a row or cell copied alone the same.
  const rowText = (row: PmNode) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(textOf(cell)));
    return cells.join('\t');
  };
  const tableLines = (node: PmNode): string[] => {
    if (node.type.spec.tableRole === 'table') {
      const rows: string[] = [];
      node.forEach((row) => rows.push(...tableLines(row)));
      return rows;
    }
    if (node.type.spec.tableRole === 'row') return [rowText(node)];
    return [textOf(node)];
  };
  slice.content.forEach((node, _offset, index) => {
    if (node.type.spec.tableRole) {
      lines.push(...tableLines(node));
      return;
    }
    if (node.type.name !== 'paragraph') return;
    const marker = markers[index];
    const whole = index > 0 || slice.openStart === 0;
    lines.push(
      `${marker && whole ? `${markerText(marker)} ` : ''}${node.textBetween(0, node.content.size, '', leaf)}`,
    );
  });
  return lines.join('\n');
}

/** Plain text pasted: a paragraph per line, empty lines kept, each in the formatting at the caret. */
export function plainTextSlice(text: string, $context: ResolvedPos): Slice {
  const { schema } = $context.doc.type;
  const parent = $context.parent;
  const place = parent.type.name === 'paragraph' ? placeOf(parent) : null;
  const attrs =
    parent.type.name === 'paragraph'
      ? {
          ...parent.attrs,
          kept: null,
          // Each line a new item of the caret's list, never restarting it or ticked.
          list: place
            ? ({
                id: place.id,
                level: place.level,
                ...(place.unnumbered ? { unnumbered: true } : {}),
              } satisfies ListPlace)
            : null,
        }
      : null;
  const marks = $context.marks();
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const clean = [...line].filter(isHeld).join('');
      return schema.nodes.paragraph!.create(attrs, clean ? schema.text(clean, marks) : undefined);
    });
  return new Slice(Fragment.from(paragraphs), 1, 1);
}
