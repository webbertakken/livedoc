// The unit a paragraph's indents are shown and typed in (docs/specs/034-text-documents/text-and-paragraphs.md
// "Alignment and indents"): inches where the browser's language is American English, centimetres elsewhere (default).
export type IndentUnit = 'in' | 'cm';

const PT_PER: Record<IndentUnit, number> = { in: 72, cm: 72 / 2.54 };

/** The most an indent field takes: Google's largest page side, 22 in (55.88 cm). */
export const INDENT_FIELD_MAX: Record<IndentUnit, number> = { in: 22, cm: 55.88 };

export function indentUnit(
  language = typeof navigator === 'undefined' ? '' : navigator.language,
): IndentUnit {
  return language.toLowerCase() === 'en-us' ? 'in' : 'cm';
}

/** Points shown in the unit, to two decimals. */
export const unitOf = (pt: number, unit: IndentUnit): number =>
  Math.round((pt / PT_PER[unit]) * 100) / 100;

/** A value in the unit, as points. */
export const ptOf = (value: number, unit: IndentUnit): number => value * PT_PER[unit];

/** A typed field read: its number, null for blank (no change), or 'invalid' outside 0 to the field's most. */
export function readIndentField(text: string, unit: IndentUnit): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > INDENT_FIELD_MAX[unit]) return 'invalid';
  return value;
}
