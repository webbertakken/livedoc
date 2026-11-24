// "More colours" (docs/specs/004-interface-design/colour-picker.md "Skins"): four of the standard colours (Red,
// Orange, Green, Blue), in their order, as dots in a dashed 20px square. The glyph of every trigger that opens the
// full picker from a quick row (Quick Style's rows, a Sheet's Text and Fill Colour), never a +.
import { standardColours } from '@livedoc/document';

const GLYPH_DOTS = [2, 3, 5, 7].map((i) => standardColours('strong', 'light')[i]!.hex);

export function MoreColoursGlyph() {
  return (
    <span
      aria-hidden
      className="grid size-icon-title grid-cols-2 place-items-center rounded-control border border-dashed border-slate-400 p-0.5 dark:border-slate-500"
    >
      {GLYPH_DOTS.map((c) => (
        <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}
