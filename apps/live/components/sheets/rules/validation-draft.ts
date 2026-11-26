// The Data Validation rule editor's draft (docs/specs/029-sheets/data-validation.md "Making and changing rules"): the
// rule kinds and their conditions as the editor names them, a rule or a new one over the selection as a draft, and the
// draft as a rule's settings or why it cannot be one. Shared by the Plan Sheet's popover and the spreadsheet's panel.
import {
  DROPDOWN_OPTIONS_MAX,
  compileTypedFormula,
  customValue,
  formulaAsTyped,
  DROPDOWN_OPTION_MAX,
  VALIDATION_HELP_MAX,
  cellKey,
  displayValue,
  formatRange,
  isoFromSerial,
  parseLocaleNumber,
  posRangeOf,
  serialFromIso,
  type GridRange,
  type RuleSettings,
  type RuleSource,
  sourceFromText,
  sourceSheetOf,
  sourceText,
  type StoredFormula,
  type ValidationKind,
  type ValidationRule,
} from '@livedoc/sheets';
import { standardGroup } from '@/components/colour/colour-options';
import { GREY_PEN_COLOUR, INK_PEN_COLOUR, standardColours } from '@livedoc/document';
import type { SheetController } from '../sheet-controller';
// Options take the soft Standard Colours in turn, so each reads apart as a chip (data-validation.md).
// Ink and grey aside: a white or grey chip barely reads as one.
export const NEUTRALS = new Set<string>([INK_PEN_COLOUR, GREY_PEN_COLOUR]);
export const OPTION_COLOURS = standardColours('soft', 'light')
  .filter((c) => !NEUTRALS.has(c.name))
  .map((c) => c.hex.toLowerCase());
export const OPTION_GROUPS = [
  standardGroup('soft', 'light', 'hex'),
  standardGroup('strong', 'light', 'hex'),
];

export const KINDS: { id: ValidationKind; label: string }[] = [
  { id: 'list', label: 'Dropdown' },
  { id: 'range', label: 'Dropdown (From a Range)' },
  { id: 'check', label: 'Checkbox' },
  { id: 'num', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'text', label: 'Text' },
  { id: 'formula', label: 'Custom Formula Is' },
];
export const OPS: Record<
  'num' | 'date' | 'text',
  { id: string; label: string; values: 0 | 1 | 2 }[]
> = {
  num: [
    { id: 'between', label: 'Is Between', values: 2 },
    { id: 'notBetween', label: 'Is Not Between', values: 2 },
    { id: 'gt', label: 'Greater Than', values: 1 },
    { id: 'gte', label: 'Greater Than or Equal To', values: 1 },
    { id: 'lt', label: 'Less Than', values: 1 },
    { id: 'lte', label: 'Less Than or Equal To', values: 1 },
    { id: 'eq', label: 'Is Equal To', values: 1 },
    { id: 'neq', label: 'Is Not Equal To', values: 1 },
  ],
  date: [
    { id: 'valid', label: 'Is a Valid Date', values: 0 },
    { id: 'before', label: 'Is Before', values: 1 },
    { id: 'onOrBefore', label: 'Is On or Before', values: 1 },
    { id: 'after', label: 'Is After', values: 1 },
    { id: 'onOrAfter', label: 'Is On or After', values: 1 },
    { id: 'on', label: 'Is On', values: 1 },
    { id: 'between', label: 'Is Between', values: 2 },
    { id: 'notBetween', label: 'Is Not Between', values: 2 },
  ],
  text: [
    { id: 'contains', label: 'Contains', values: 1 },
    { id: 'notContains', label: 'Does Not Contain', values: 1 },
    { id: 'exactly', label: 'Is Exactly', values: 1 },
    { id: 'email', label: 'Is a Valid Email', values: 0 },
    { id: 'url', label: 'Is a Valid URL', values: 0 },
  ],
};
export const SHOWS = [
  { id: 'chip', label: 'Chip' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'plain', label: 'Plain Text' },
] as const;

export type Option = { key: number; v: string; c?: string };
export type Draft = {
  range: string;
  is: ValidationKind;
  opts: Option[];
  show: 'chip' | 'arrow' | 'plain';
  src: string;
  op: string;
  a: string;
  b: string;
  warn: boolean;
  help: string;
  // A Checkbox's Use Custom Cell Values, and its ticked and unticked values as typed.
  custom: boolean;
  on: string;
  off: string;
  // A Custom Formula Is rule's formula as typed, for the range's top-left cell.
  fx: string;
  // A dropdown's Allow Multiple Selections.
  multi: boolean;
};

// What reading a draft needs: the person's locale, a typed Dropdown from a Range's cells as stored (`A2:A20` or
// `Sheet2!A2:A20`), and a formula compiled for the range's top-left cell (null when either cannot be read).
export type DraftEnv = {
  locale: string;
  source: (text: string) => RuleSource | null;
  compile: (text: string) => StoredFormula | null;
};

// The draft env of the open sheet.
export function draftEnv(c: SheetController): DraftEnv {
  return {
    locale: c.locale,
    source: (text) => sourceFromText(c.workbook.ctxFor(c.sheet.id), text),
    compile: (text) => {
      const made = compileTypedFormula(text, c.locale, c.workbook.ctxFor(c.sheet.id));
      return made.ok ? made.formula : null;
    },
  };
}

let optionKey = 0;
export const nextKey = () => ++optionKey;

export function rangeText(
  c: SheetController,
  r: { r1: string; c1: string; r2: string; c2: string } | undefined,
) {
  const p = r ? posRangeOf(c.sheet.layout, r) : null;
  return p ? formatRange(p) : '';
}

// The distinct values already in the selection (up to the options' limit), each a Theme Palette colour in turn.
export function optionsFromCells(
  c: SheetController,
  g: GridRange,
  palette: readonly string[],
): Option[] {
  const out: Option[] = [];
  const seen = new Set<string>();
  for (let r = g.r1; r <= g.r2 && out.length < DROPDOWN_OPTIONS_MAX; r++)
    for (let col = g.c1; col <= g.c2 && out.length < DROPDOWN_OPTIONS_MAX; col++) {
      const rowId = c.sheet.layout.rows[r];
      const colId = c.sheet.layout.cols[col];
      if (!rowId || !colId) continue;
      const shown = displayValue(
        c.workbook.value(c.sheet.id, r, col),
        c.sheet.cells.get(cellKey(rowId, colId))?.format,
        c.locale,
      ).text.trim();
      if (!shown || shown.length > DROPDOWN_OPTION_MAX || seen.has(shown.toLowerCase())) continue;
      seen.add(shown.toLowerCase());
      out.push({ key: nextKey(), v: shown, c: palette[out.length % palette.length] });
    }
  return out;
}

export function draftOf(
  c: SheetController,
  rule: ValidationRule | undefined,
  palette: readonly string[],
): Draft {
  const sel = c.selection.ranges[c.selection.ranges.length - 1]!;
  if (!rule) {
    const opts = optionsFromCells(c, sel, palette);
    return {
      range: formatRange(sel),
      is: 'list',
      opts: opts.length
        ? opts
        : [
            { key: nextKey(), v: '' },
            { key: nextKey(), v: '' },
          ],
      show: 'chip',
      src: '',
      op: '',
      a: '',
      b: '',
      warn: false,
      help: '',
      custom: false,
      on: '',
      off: '',
      fx: '=',
      multi: false,
    };
  }
  const asText = (v: number | string | undefined) =>
    v === undefined
      ? ''
      : rule.is === 'date' && typeof v === 'number'
        ? isoFromSerial(v)
        : String(v);
  return {
    range: rangeText(c, rule),
    is: rule.is,
    opts: (rule.opts ?? []).map((o) => ({ key: nextKey(), v: o.v, c: o.c })),
    show: rule.show ?? 'chip',
    src: rule.src
      ? sourceText(sourceSheetOf(c.workbook.ctxFor(c.sheet.id), rule.src), rule.src)
      : '',
    op: rule.op ?? '',
    a: asText(rule.a),
    b: asText(rule.b),
    warn: !!rule.warn,
    help: rule.help ?? '',
    custom: rule.on !== undefined,
    on: rule.on === undefined ? '' : String(rule.on),
    off: rule.off === undefined ? '' : String(rule.off),
    fx: rule.fx ? formulaAsTyped(rule.fx, c.workbook.ctxFor(c.sheet.id), c.locale) : '=',
    multi: !!rule.multi,
  };
}

// The draft as a rule's settings, or why it cannot be one.
export function settingsOf(
  d: Draft,
  env: DraftEnv,
): { ok: true; settings: RuleSettings } | { ok: false; why: string } {
  const { locale } = env;
  const extra = {
    ...(d.warn ? { warn: true as const } : {}),
    ...(d.help.trim() ? { help: d.help.trim().slice(0, VALIDATION_HELP_MAX) } : {}),
  };
  switch (d.is) {
    case 'check': {
      if (!d.custom) return { ok: true, settings: { is: 'check', ...extra } };
      const on = customValue(d.on);
      const off = d.off.trim() ? customValue(d.off) : undefined;
      if (on === '') return { ok: false, why: 'Enter a ticked value' };
      if (off !== undefined && String(on).toLowerCase() === String(off).toLowerCase())
        return { ok: false, why: 'Ticked and unticked values must be different' };
      return {
        ok: true,
        settings: { is: 'check', on, ...(off === undefined ? {} : { off }), ...extra },
      };
    }
    case 'formula': {
      const text = d.fx.trim();
      const fx =
        text && text !== '=' ? env.compile(text.startsWith('=') ? text : `=${text}`) : null;
      if (!fx) return { ok: false, why: "That formula can't be read" };
      return { ok: true, settings: { is: 'formula', fx, ...extra } };
    }
    case 'list': {
      const opts = d.opts.map((o) => ({ v: o.v.trim(), c: o.c })).filter((o) => o.v);
      if (!opts.length) return { ok: false, why: 'Add at least one option' };
      if (new Set(opts.map((o) => o.v.toLowerCase())).size !== opts.length)
        return { ok: false, why: 'Each option must be different' };
      return {
        ok: true,
        settings: {
          is: 'list',
          opts: opts.map((o) => (o.c ? { v: o.v, c: o.c } : { v: o.v })),
          ...(d.show === 'chip' ? {} : { show: d.show }),
          ...(d.multi ? { multi: true as const } : {}),
          ...extra,
        },
      };
    }
    case 'range': {
      const src = env.source(d.src);
      if (!src) return { ok: false, why: 'Type the range to take options from, like A2:A20' };
      return {
        ok: true,
        settings: {
          is: 'range',
          src,
          ...(d.show === 'chip' ? {} : { show: d.show }),
          ...(d.multi ? { multi: true as const } : {}),
          ...extra,
        },
      };
    }
    case 'num':
    case 'date':
    case 'text': {
      const op = OPS[d.is].find((o) => o.id === d.op) ?? OPS[d.is][0]!;
      const read = (t: string) =>
        d.is === 'date' ? (t ? serialFromIso(t) : null) : parseLocaleNumber(t.trim(), locale);
      if (d.is === 'text') {
        if (op.values === 0)
          return { ok: true, settings: { is: 'text', op: op.id as never, ...extra } };
        if (!d.a.trim()) return { ok: false, why: 'Enter a value' };
        return { ok: true, settings: { is: 'text', op: op.id as never, a: d.a.trim(), ...extra } };
      }
      if (op.values === 0)
        return { ok: true, settings: { is: d.is, op: op.id as never, ...extra } };
      const a = read(d.a);
      const b = op.values === 2 ? read(d.b) : undefined;
      if (a === null || b === null)
        return { ok: false, why: d.is === 'date' ? 'Enter a date' : 'Enter a number' };
      return {
        ok: true,
        settings: { is: d.is, op: op.id as never, a, ...(b === undefined ? {} : { b }), ...extra },
      };
    }
  }
}
