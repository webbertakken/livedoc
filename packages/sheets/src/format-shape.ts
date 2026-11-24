// What a cell's number format is, as CELL and ISDATE read it (docs/specs/029-sheets/formulas.md "Functions":
// Information): OpenFormula's CELL "format" code (Part 4, 6.13.3: `G`, `F2`, `,2`, `C2`, `P0`, `S2`, `D1` to `D9`,
// then `-` when negative numbers are coloured and `()` when positive ones are bracketed), and whether it draws a date.
import { isDateSection, splitSections } from './format-codes';
import type { CellFormat } from './sheet';

export type FormatShape = {
  // OpenFormula's code for the format, with its `-` and `()` marks.
  code: string;
  // Negative numbers drawn in a colour (CELL "color").
  coloured: boolean;
  // Positive numbers drawn in brackets (CELL "parentheses").
  bracketed: boolean;
  // It draws a day: a date or a date and time, not a time alone (ISDATE).
  date: boolean;
};

const PLAIN: FormatShape = { code: 'G', coloured: false, bracketed: false, date: false };

// A number format's decimals when it sets none: the Number, Percent, Currency and Scientific formats draw two.
const DECIMALS_DEFAULT = 2;

/** The shape of a cell's format; no format is OpenFormula's `G` (General). */
export function formatShape(format: CellFormat | undefined): FormatShape {
  const dp = format?.dp ?? DECIMALS_DEFAULT;
  switch (format?.nf) {
    case 'number':
    case 'financial':
      return { ...PLAIN, code: `,${dp}` };
    case 'percent':
      return { ...PLAIN, code: `P${dp}` };
    case 'currency':
    case 'accounting':
      return { ...PLAIN, code: `C${dp}` };
    case 'scientific':
      return { ...PLAIN, code: `S${dp}` };
    case 'date':
      return { ...PLAIN, code: 'D4', date: true };
    case 'datetime':
      return { ...PLAIN, code: 'D4', date: true };
    case 'time':
    case 'duration':
      return { ...PLAIN, code: 'D8' };
    case 'custom':
      return format.nc ? codeShape(format.nc) : PLAIN;
    default:
      return format?.dp !== undefined ? { ...PLAIN, code: `F${format.dp}` } : PLAIN;
  }
}

// A section with its quoted text, escapes and brackets taken out, so only the code's own characters are read.
function bare(section: string): string {
  return section.replace(/"[^"]*"/g, '').replace(/\\./g, '');
}

function codeShape(code: string): FormatShape {
  const sections = splitSections(code);
  const first = sections[0] ?? '';
  const coloured = /\[[a-z]+\d*\]/i.test(bare(sections[1] ?? '').replace(/\[[hms]+\]/gi, ''));
  const bracketed = bare(first).includes('(');
  const marks = `${coloured ? '-' : ''}${bracketed ? '()' : ''}`;
  if (isDateSection(first)) {
    // Elapsed hours, minutes and seconds (`[h]`) keep their letters; colours and conditions go.
    const section = bare(first)
      .replace(/\[([hms]+)\]/gi, '$1')
      .replace(/\[[^\]]*\]/g, '');
    const kind = dateKind(section.toLowerCase());
    return { code: `${kind.code}${marks}`, coloured, bracketed, date: kind.date };
  }
  const body = bare(first).replace(/\[[^\]]*\]/g, '');
  if (body.trim() === '' || /^general$/i.test(body.trim()) || body.includes('@'))
    return { ...PLAIN, code: `G${marks}`, coloured, bracketed };
  const dot = body.indexOf('.');
  const decimals = dot < 0 ? 0 : (/^[0#?]*/.exec(body.slice(dot + 1))?.[0].length ?? 0);
  const letter = body.includes('%')
    ? 'P'
    : /e[+-]/i.test(body)
      ? 'S'
      : /[$£€¥]/.test(first)
        ? 'C'
        : /[0#?],[0#?]/.test(body)
          ? ','
          : 'F';
  return { code: `${letter}${decimals}${marks}`, coloured, bracketed, date: false };
}

// OpenFormula's date codes, as Excel gives them: D1 d-mmm-yy, D2 d-mmm, D3 mmm-yy, D4 m/d/yy (with or without a
// time), D5 m/d, D6 h:mm:ss AM/PM, D7 h:mm AM/PM, D8 h:mm:ss, D9 h:mm.
function dateKind(section: string): { code: string; date: boolean } {
  const ampm = /am\/pm|a\/p/.test(section);
  const plain = section.replace(/am\/pm|a\/p/g, '');
  const day = /d/.test(plain);
  const year = /y/.test(plain);
  const named = /mmm/.test(plain);
  // An m beside an h or before an s is minutes, not a month.
  const month = /m/.test(plain.replace(/h+[^a-z]*m+|m+([^a-z]*s)/g, ''));
  if (!day && !year && !month) {
    const seconds = /s/.test(plain);
    return { code: ampm ? (seconds ? 'D6' : 'D7') : seconds ? 'D8' : 'D9', date: false };
  }
  if (named) return { code: day && year ? 'D1' : day ? 'D2' : 'D3', date: true };
  return { code: year ? 'D4' : 'D5', date: true };
}
