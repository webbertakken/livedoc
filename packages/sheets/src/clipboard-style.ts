// Pasted CSS read as a cell's formats (docs/specs/029-sheets/grid-and-editing.md "Clipboard", D153): the inline styles
// Google Sheets writes, and the class rules Excel puts in a <style> block, with Excel's `mso-number-format`.
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from './format';
import { formatCodeReads } from './format-codes';
import type { Border, CellFormat } from './sheet';

const COLOUR_NAMES: Record<string, string> = {
  black: '#000000',
  windowtext: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  blue: '#0000ff',
  green: '#008000',
  yellow: '#ffff00',
};

export function colourOf(v: string): string | undefined {
  const t = v.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (hex) {
    const h = hex[1]!;
    return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t);
  if (rgb)
    return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return COLOUR_NAMES[t];
}

/** A style attribute's declarations, in order: split at `;` outside quotes, a `\` escaping the next character. */
export function declarations(style: string): [string, string][] {
  const out: [string, string][] = [];
  let part = '';
  let quote: string | null = null;
  const flush = () => {
    const i = part.indexOf(':');
    if (i > 0) out.push([part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()]);
    part = '';
  };
  for (let i = 0; i < style.length; i++) {
    const ch = style[i]!;
    if (ch === '\\') {
      part += ch + (style[i + 1] ?? '');
      i++;
    } else if (quote) {
      if (ch === quote) quote = null;
      part += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      part += ch;
    } else if (ch === ';') flush();
    else part += ch;
  }
  flush();
  return out;
}

/** Excel's class rules (`.xl65 { ... }`) from the <style> blocks of pasted HTML, by class name. */
export function excelClassStyles(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = block[1]!.replace(/<!--|-->/g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g))
      for (const selector of rule[1]!.split(',')) {
        const name = /^\s*(?:td)?\.([\w-]+)\s*$/i.exec(selector)?.[1];
        if (name) out.set(name.toLowerCase(), rule[2]!.trim());
      }
  }
  return out;
}

// Excel's named number formats, and its text one.
const EXCEL_FORMATS: Record<string, CellFormat['nf']> = {
  '@': 'text',
  percent: 'percent',
  fixed: 'number',
  standard: 'number',
  currency: 'currency',
  scientific: 'scientific',
  'short date': 'date',
  'medium date': 'date',
  'long date': 'date',
  'short time': 'time',
  'medium time': 'time',
  'long time': 'time',
};

/** Excel's `mso-number-format` value as the cell's number format: a named one, or its code as Custom. */
export function excelNumberFormat(value: string): Pick<CellFormat, 'nf' | 'nc'> | undefined {
  const code = value
    .replace(/^"(.*)"$/s, '$1')
    .replace(/\\(.)/g, '$1')
    .trim();
  if (!code || code.toLowerCase() === 'general') return undefined;
  const named = EXCEL_FORMATS[code.toLowerCase()];
  if (named) return { nf: named };
  // A code the sheet cannot read (Excel's own) is left out, the value pasting as it shows.
  return formatCodeReads(code) ? { nf: 'custom', nc: code } : undefined;
}

// A border declaration's value (`1px solid #000000`, Excel's `.5pt solid windowtext`), or null for none.
function borderOf(v: string): Border | null {
  const parts = v.toLowerCase().split(/\s+/);
  if (parts.includes('none') || parts.includes('hidden')) return null;
  const style = (['dashed', 'dotted', 'solid', 'double'] as const).find((s) => parts.includes(s));
  if (!style) return null;
  const size = parts.find((x) => /^[\d.]+(px|pt)$/.test(x));
  const px = size ? parseFloat(size) * (size.endsWith('pt') ? 4 / 3 : 1) : 1;
  const w = px <= 1.5 ? 1 : px <= 2.5 ? 2 : 3;
  const colour = parts.map(colourOf).find(Boolean) ?? '#000000';
  return { w, s: style === 'double' ? 'solid' : style, c: colour };
}

const SIDE_KEYS: Record<string, readonly ('bt' | 'br' | 'bb' | 'bl')[]> = {
  border: ['bt', 'br', 'bb', 'bl'],
  'border-top': ['bt'],
  'border-right': ['br'],
  'border-bottom': ['bb'],
  'border-left': ['bl'],
};

/** A cell's formats from its CSS and the formatting tags inside it; undefined for none. */
export function formatFromStyle(style: string, tags: Set<string>): CellFormat | undefined {
  const f: CellFormat = {};
  for (const [k, raw] of declarations(style)) {
    const v = raw.toLowerCase();
    if (k === 'font-weight' && (v === 'bold' || Number(v) >= 600)) f.b = true;
    if (k === 'font-style' && v === 'italic') f.i = true;
    if (k === 'text-decoration' || k === 'text-decoration-line') {
      if (v.includes('underline')) f.u = true;
      if (v.includes('line-through')) f.st = true;
    }
    if (k === 'color') {
      const c = colourOf(v);
      if (c && c !== '#000000') f.fc = c;
    }
    if (k === 'background-color' || k === 'background') {
      const c = colourOf(v);
      if (c && c !== '#ffffff') f.bg = c;
    }
    if (k === 'text-align') {
      if (v === 'center') f.ha = 'c';
      if (v === 'right') f.ha = 'r';
      if (v === 'left') f.ha = 'l';
    }
    // Bottom is both Google's and Excel's own, written on every cell: only a chosen top or middle is read.
    if (k === 'vertical-align') {
      if (v === 'top') f.va = 't';
      if (v === 'middle') f.va = 'm';
    }
    if (k === 'font-size') {
      const n = parseFloat(v);
      const pt = v.endsWith('px') ? n * 0.75 : n;
      if (v.endsWith('pt') || v.endsWith('px'))
        f.fs = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(pt)));
    }
    const sides = SIDE_KEYS[k];
    if (sides) {
      const b = borderOf(v);
      for (const side of sides)
        if (b) f[side] = b;
        else delete f[side];
    }
    if (k === 'mso-number-format') {
      const nf = excelNumberFormat(raw);
      if (nf) Object.assign(f, nf);
    }
  }
  if (tags.has('b') || tags.has('strong')) f.b = true;
  if (tags.has('i') || tags.has('em')) f.i = true;
  if (tags.has('u')) f.u = true;
  if (tags.has('s') || tags.has('strike') || tags.has('del')) f.st = true;
  return Object.keys(f).length ? f : undefined;
}
