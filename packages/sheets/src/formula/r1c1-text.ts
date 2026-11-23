// A formula's text turned between A1 and R1C1 references, relative to the cell it sits in (grid-and-editing.md
// "Clipboard", D152): Google Sheets carries a copied formula as R1C1 in `data-sheets-formula` (`=R[0]C[-1]*2` beside
// its input), so a copy keeps its meaning wherever it is pasted. Text inside "strings" and 'sheet names' is left alone;
// whole rows and columns (`A:A`, `R2`) are left as they are written.
import { columnIndex, columnLetters } from '../address';

type At = { r: number; c: number };

// The formula's text with `swap` run on each stretch outside string literals and quoted sheet names.
function outsideQuotes(text: string, swap: (chunk: string) => string): string {
  let out = '';
  let chunk = '';
  for (let i = 0; i < text.length; i++) {
    const q = text[i]!;
    if (q !== '"' && q !== "'") {
      chunk += q;
      continue;
    }
    out += swap(chunk);
    chunk = '';
    // The quoted run, a doubled quote inside it kept as one.
    let j = i + 1;
    for (; j < text.length; j++)
      if (text[j] === q) {
        if (text[j + 1] === q) j++;
        else break;
      }
    out += text.slice(i, j + 1);
    i = j;
  }
  return out + swap(chunk);
}

const A1_REF = /(?<![A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(!])/g;
const R1C1_REF = /(?<![A-Za-z0-9_.])R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(!])/gi;

/** A1 references in a formula's text as R1C1, relative to `at` (`$` parts absolute). */
export function a1ToR1C1(text: string, at: At): string {
  return outsideQuotes(text, (chunk) =>
    chunk.replace(A1_REF, (_, colAbs: string, letters: string, rowAbs: string, digits: string) => {
      const r = Number(digits) - 1;
      const c = columnIndex(letters);
      const row = rowAbs ? `R${r + 1}` : `R[${r - at.r}]`;
      const col = colAbs ? `C${c + 1}` : `C[${c - at.c}]`;
      return row + col;
    }),
  );
}

/** R1C1 references in a formula's text as A1, relative to `at`; null when one would fall off the sheet's top or left. */
export function r1c1ToA1(text: string, at: At): string | null {
  let off = false;
  const axis = (part: string | undefined, own: number): { i: number; abs: boolean } => {
    if (part === undefined) return { i: own, abs: false };
    if (part.startsWith('[')) return { i: own + Number(part.slice(1, -1)), abs: false };
    return { i: Number(part) - 1, abs: true };
  };
  const out = outsideQuotes(text, (chunk) =>
    chunk.replace(R1C1_REF, (_, rowPart?: string, colPart?: string) => {
      const row = axis(rowPart, at.r);
      const col = axis(colPart, at.c);
      if (row.i < 0 || col.i < 0) off = true;
      return `${col.abs ? '$' : ''}${columnLetters(Math.max(0, col.i))}${row.abs ? '$' : ''}${Math.max(0, row.i) + 1}`;
    }),
  );
  return off ? null : out;
}
