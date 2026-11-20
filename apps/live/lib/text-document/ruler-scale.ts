// The ruler's scale (docs/specs/034-text-documents/editing-surface.md "The ruler"): a mark every eighth of an inch or
// quarter of a centimetre, a longer one at each half, each whole unit numbered from the left margin both ways; and
// what a drag or a pressed point snaps to.
import { unitOf, type IndentUnit } from './indent-units';

/** The ruler's finest mark, in points: an eighth of an inch, a quarter of a centimetre. */
export const RULER_STEP_PT: Record<IndentUnit, number> = { in: 72 / 8, cm: 72 / 2.54 / 4 };
// Marks to a whole unit.
const PER_UNIT: Record<IndentUnit, number> = { in: 8, cm: 4 };

export type RulerMark = {
  /** Points from the page's left edge. */
  readonly at: number;
  readonly kind: 'whole' | 'half' | 'minor';
  /** A whole unit's number, counted from the left margin; none at the margin itself. */
  readonly label?: string;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Every mark across a page this wide, counted from its left margin. */
export function rulerMarks(pageWidth: number, marginLeft: number, unit: IndentUnit): RulerMark[] {
  const step = RULER_STEP_PT[unit];
  const per = PER_UNIT[unit];
  const marks: RulerMark[] = [];
  const first = Math.ceil(-marginLeft / step - 1e-9);
  const last = Math.floor((pageWidth - marginLeft) / step + 1e-9);
  for (let k = first; k <= last; k += 1) {
    const at = round3(marginLeft + k * step);
    if (k % per === 0)
      marks.push(
        k === 0 ? { at, kind: 'whole' } : { at, kind: 'whole', label: String(Math.abs(k / per)) },
      );
    else marks.push({ at, kind: k % (per / 2) === 0 ? 'half' : 'minor' });
  }
  return marks;
}

/** A length snapped to the nearest mark. */
export const snapPt = (pt: number, unit: IndentUnit): number =>
  round3(Math.round(pt / RULER_STEP_PT[unit]) * RULER_STEP_PT[unit]);

/** A length as the ruler's tooltip reads it: "0.5 in", "1.27 cm". */
export const lengthText = (pt: number, unit: IndentUnit): string => `${unitOf(pt, unit)} ${unit}`;
