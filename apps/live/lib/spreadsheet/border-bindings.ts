// Borders over the selection (docs/specs/029-sheets/formatting.md "Borders", D209): the toolbar's Borders panel and
// the six border shortcuts draw a placement in the colour and line chosen for the open spreadsheet, black and thin
// to start.
import type { Border, BorderMode } from '@livedoc/sheets';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import type { OfficeBorderLine, OfficeBorders } from '@/components/office/OfficeBordersPanel';

/** The colour and line the borders draw in. */
export type BorderLineChoice = { colour: string; line: OfficeBorderLine };

export const BORDER_LINE_START: BorderLineChoice = { colour: '#000000', line: 'thin' };

const STROKES: Readonly<Record<OfficeBorderLine, Pick<Border, 'w' | 's'>>> = {
  thin: { w: 1, s: 'solid' },
  medium: { w: 2, s: 'solid' },
  thick: { w: 3, s: 'solid' },
  dashed: { w: 1, s: 'dashed' },
  dotted: { w: 1, s: 'dotted' },
  double: { w: 3, s: 'double' },
};

/** The border a choice draws. */
export const strokeOf = ({ colour, line }: BorderLineChoice): Border => ({
  ...STROKES[line],
  c: colour,
});

type Draw = (mode: BorderMode, border: Border) => void;

/** The Borders panel's binding: a placement drawn in the choice, and the choice kept anew. */
export function gridBorders(
  choice: BorderLineChoice,
  draw: Draw,
  choose: (next: BorderLineChoice) => void,
): OfficeBorders {
  return {
    apply: (placement) => draw(placement, strokeOf(choice)),
    colour: choice.colour,
    setColour: (colour) => choose({ ...choice, colour }),
    line: choice.line,
    setLine: (line) => choose({ ...choice, line }),
  };
}

const SHORTCUTS: readonly [string, BorderMode][] = [
  ['apply-top-border', 'top'],
  ['apply-right-border', 'right'],
  ['apply-bottom-border', 'bottom'],
  ['apply-left-border', 'left'],
  ['remove-borders', 'none'],
  ['apply-outer-border', 'outer'],
];

/** The border shortcuts (keyboard-shortcuts.md "Format cells"), bound by their rows' ids. */
export function borderBindings(choice: BorderLineChoice, draw: Draw): Record<string, OfficeAction> {
  return Object.fromEntries(
    SHORTCUTS.map(([id, mode]) => [id, { run: () => draw(mode, strokeOf(choice)) }]),
  );
}
