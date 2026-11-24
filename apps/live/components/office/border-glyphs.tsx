// The border glyphs the borders pickers draw (docs/specs/029-sheets/formatting.md "Borders", sheet.md "Toolbar"): a
// placement as a 2 x 2 cell square with the lines it sets in ink and the rest faint and dashed, and a line as it
// draws. Shared by the spreadsheet's Borders panel and a Plan Sheet's Borders menu.
import { Glyph } from '@livedoc/ui';

/** Where borders go in a range: Inner between cells, Horizontal between rows, Vertical between columns. */
export type BorderPlacement =
  | 'all'
  | 'inner'
  | 'horizontal'
  | 'vertical'
  | 'outer'
  | 'left'
  | 'top'
  | 'right'
  | 'bottom'
  | 'none';

/** A border's line: its width in px (a double always three) and its style. */
export type BorderStroke = { w: 1 | 2 | 3; s: 'solid' | 'dashed' | 'dotted' | 'double' };

// A 2 x 2 cell square: each of its six lines drawn in ink when the placement sets it, else faint and dashed.
export function BorderPlacementGlyph({ placement }: { placement: BorderPlacement }) {
  const outer = placement === 'all' || placement === 'outer';
  const inner = placement === 'all' || placement === 'inner';
  const lines: { d: string; on: boolean }[] = [
    { d: 'M3 3H17', on: outer || placement === 'top' },
    { d: 'M3 17H17', on: outer || placement === 'bottom' },
    { d: 'M3 3V17', on: outer || placement === 'left' },
    { d: 'M17 3V17', on: outer || placement === 'right' },
    { d: 'M10 3V17', on: inner || placement === 'vertical' },
    { d: 'M3 10H17', on: inner || placement === 'horizontal' },
  ];
  return (
    <Glyph size={18} units={20}>
      {lines.map((l) =>
        l.on ? null : (
          <path
            key={l.d}
            d={l.d}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="1.5 1.5"
          />
        ),
      )}
      {lines.map((l) =>
        l.on ? <path key={l.d} d={l.d} stroke="currentColor" strokeWidth={1.75} /> : null,
      )}
    </Glyph>
  );
}

// A line as it will draw; a double as two thin lines.
export function BorderLineGlyph({ line }: { line: BorderStroke }) {
  if (line.s === 'double')
    return (
      <Glyph size={22} units={24}>
        <path d="M2 10.5H22M2 13.5H22" stroke="currentColor" strokeWidth={1} />
      </Glyph>
    );
  const dash = line.s === 'dashed' ? '5 3' : line.s === 'dotted' ? '1 3' : undefined;
  return (
    <Glyph size={22} units={24}>
      <path
        d="M2 12H22"
        stroke="currentColor"
        strokeWidth={line.w === 1 ? 1.25 : line.w === 2 ? 2.25 : 3.5}
        strokeDasharray={dash}
        strokeLinecap={line.s === 'dotted' ? 'round' : 'butt'}
      />
    </Glyph>
  );
}
