// A copied range as an HTML table (docs/specs/029-sheets/grid-and-editing.md "Clipboard", D152 to D154), the form
// Google Sheets, Excel, documents and emails read: each cell's text with its formats inline as Google writes them, a
// formula in Google's `data-sheets-formula` (R1C1 from its cell), a merge as one cell spanning its rows and columns.
import type { SheetClip } from './clipboard';
import { STANDARD_THEME, themedFormat, type SpreadsheetTheme } from './themes/spreadsheet-theme';
import { a1ToR1C1 } from './formula/r1c1-text';
import { fontFamilyName } from './format';
import type { Border, CellFormat } from './sheet';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]!);

const SIDES = [
  ['bt', 'top'],
  ['br', 'right'],
  ['bb', 'bottom'],
  ['bl', 'left'],
] as const;

const borderCss = (b: Border) => `${b.w}px ${b.s} ${b.c}`;

/** A cell's formats as inline CSS (` style="..."`), or nothing. */
export function styleOf(f: CellFormat | undefined): string {
  if (!f) return '';
  const out: string[] = [];
  if (f.b) out.push('font-weight:bold');
  if (f.i) out.push('font-style:italic');
  const deco = [f.u ? 'underline' : '', f.st ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) out.push(`text-decoration:${deco}`);
  if (f.fc) out.push(`color:${f.fc}`);
  if (f.bg) out.push(`background-color:${f.bg}`);
  if (f.ha) out.push(`text-align:${f.ha === 'l' ? 'left' : f.ha === 'c' ? 'center' : 'right'}`);
  if (f.va) out.push(`vertical-align:${f.va === 't' ? 'top' : f.va === 'm' ? 'middle' : 'bottom'}`);
  if (f.ff) out.push(`font-family:'${fontFamilyName(f.ff)}'`);
  if (f.fs) out.push(`font-size:${f.fs}pt`);
  for (const [key, side] of SIDES) {
    const b = f[key];
    if (b) out.push(`border-${side}:${borderCss(b)}`);
  }
  return out.length ? ` style="${out.join(';')}"` : '';
}

// `theme`: the workbook's, which a cell's theme colours are drawn in (formatting.md "Themes").
export function clipToHtml(clip: SheetClip, theme: SpreadsheetTheme = STANDARD_THEME): string {
  // Each merge's corner spans it; the cells it covers are left out of their rows.
  const spans = new Map<string, { rows: number; cols: number }>();
  const covered = new Set<string>();
  for (const m of clip.merges ?? []) {
    spans.set(`${m.i1},${m.j1}`, { rows: m.i2 - m.i1 + 1, cols: m.j2 - m.j1 + 1 });
    for (let i = m.i1; i <= m.i2; i++)
      for (let j = m.j1; j <= m.j2; j++) if (i !== m.i1 || j !== m.j1) covered.add(`${i},${j}`);
  }
  const rows = clip.values.map((row, i) => {
    const tds = row.flatMap((v, j) => {
      const key = `${i},${j}`;
      if (covered.has(key)) return [];
      const span = spans.get(key);
      const formula = clip.formulas?.[key];
      const attrs =
        (span && span.rows > 1 ? ` rowspan="${span.rows}"` : '') +
        (span && span.cols > 1 ? ` colspan="${span.cols}"` : '') +
        (formula
          ? ` data-sheets-formula="${escapeHtml(a1ToR1C1(formula, { r: clip.from.r + i, c: clip.from.c + j }))}"`
          : '');
      return [
        `<td${attrs}${styleOf(themedFormat(clip.cells[i]![j]?.format, theme))}>${escapeHtml(v).replace(/\n/g, '<br>')}</td>`,
      ];
    });
    return `<tr>${tds.join('')}</tr>`;
  });
  return `<meta charset="utf-8"><table data-livedoc-sheet="1">${rows.join('')}</table>`;
}
