// Borders and shading (docs/specs/034-text-documents/text-and-paragraphs.md "Borders and shading"): what the paragraphs
// the selection touches share over the pressed positions, and the change the dialog applies to them, as one
// transaction. A paragraph left with no border of its own and no background holds none of its own.
import type { Command, EditorState } from 'prosemirror-state';
import {
  canonical,
  type BorderDash,
  type BorderLine,
  type BorderSide,
  type ParagraphProps,
} from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { paragraphPropsOf, setParagraphProps } from './text-document-paragraph-formatting';
import { selectedParagraphs } from './text-document-paragraphs';

/** Google's border widths, points (assumed). */
export const BORDER_WIDTHS = [0, 1, 2, 3, 4, 6] as const;
export const BORDER_DASHES: readonly { dash: BorderDash; label: string }[] = [
  { dash: 'solid', label: 'Solid' },
  { dash: 'dotted', label: 'Dotted' },
  { dash: 'dashed', label: 'Dashed' },
];
/** The most paragraph padding, points (default). */
export const BORDER_PADDING_MAX_PT = 72;
export const BORDER_DEFAULT_COLOUR = '#000000';

/** The dialog's fields: each the value shared, null where it differs (or is not there to read). */
export type BordersAndShading = {
  width: number | null;
  dash: BorderDash | null;
  color: string | null;
  padding: number | null;
  /** `#rrggbb`, `none`, or null where the paragraphs differ. */
  shading: string | null;
};

const shared = <T>(values: readonly T[]): T | null => {
  const first = values[0];
  return values.length > 0 && values.every((v) => canonical(v) === canonical(first))
    ? (first ?? null)
    : null;
};

/** What the paragraphs the selection touches share over these positions. */
export function bordersOf(
  state: EditorState,
  formatting: TextFormatting,
  sides: readonly BorderSide[],
): BordersAndShading {
  const drawn = selectedParagraphs(state).map(({ node }) => paragraphPropsOf(node, formatting));
  const lines = drawn.flatMap((p) => sides.map((side) => p.borders?.[side]));
  const present = lines.filter((line): line is BorderLine => line !== undefined);
  const everyLine = drawn.flatMap((p) => Object.values(p.borders ?? {}));
  return {
    width: shared(lines.map((line) => line?.width ?? 0)),
    dash: shared(present.map((line) => line.dash)),
    color: shared(present.map((line) => line.color)),
    padding: shared(everyLine.map((line) => line.space)),
    shading: shared(drawn.map((p) => p.shading ?? 'none')),
  };
}

/** What Apply sets: the fields left blank (null) change nothing. */
export type BordersChange = BordersAndShading & { sides: readonly BorderSide[] };

function changed(drawn: ParagraphProps, change: BordersChange): Partial<ParagraphProps> {
  const borders: Record<string, BorderLine> = { ...drawn.borders };
  for (const side of change.sides) {
    const current = borders[side];
    const width = change.width ?? current?.width;
    if (width === undefined) continue;
    if (width === 0) {
      delete borders[side];
      continue;
    }
    borders[side] = {
      width,
      dash: change.dash ?? current?.dash ?? 'solid',
      color: change.color ?? current?.color ?? BORDER_DEFAULT_COLOUR,
      space: change.padding ?? current?.space ?? 0,
    };
  }
  if (change.padding !== null)
    for (const side of Object.keys(borders))
      borders[side] = { ...borders[side]!, space: change.padding };
  const shading =
    change.shading === null
      ? drawn.shading
      : change.shading === 'none'
        ? undefined
        : change.shading;
  return {
    borders: Object.keys(borders).length > 0 ? borders : undefined,
    shading,
  };
}

/** Apply: the change on every paragraph the selection touches, as one undo step. */
export const setBordersAndShading = (formatting: TextFormatting, change: BordersChange): Command =>
  setParagraphProps(formatting, (drawn) => changed(drawn, change));
