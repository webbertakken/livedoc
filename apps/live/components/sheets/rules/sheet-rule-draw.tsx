// How a validation rule draws its cell (docs/specs/029-sheets/data-validation.md "Drawing"): a checkbox's box, a
// dropdown's chip or arrow, and the invalid mark. Pure parts for SheetCells, which stays pointer-free: the presses
// on a box, chip or arrow are the grid pointer's (useSheetPointer, via ruleTargetAt).
import type { CSSProperties, ReactNode } from 'react';
import { bestInk } from '@livedoc/document';
import { lucideGlyph } from '@livedoc/ui';
import { lucideCheck, lucideChevronDown } from '@livedoc/icons/lucide';
import {
  checkState,
  isArray,
  isError,
  optionFor,
  scalarOf,
  selectionParts,
  valueInvalid,
  type RuleCtx,
  type ValidationRule,
  type Value,
} from '@livedoc/sheets';
import type { PlanPalette } from '@/components/plan/plan-palette';

// data-validation.md "Drawing".
const CHECKBOX_PX = 14;
const INVALID_MARK_PX = 6;
// A chip's inset from the cell's left, its height's room above and below, and its arrow's room.
const CHIP_INSET_PX = 6;
const CHIP_PAD_Y = 4;
// The arrow's room, and the pill's padding beside the text (8 left, 4 right, 4 gap) with slack for the rough width.
const CHIP_ARROW_PX = 16;
const CHIP_TEXT_ROOM_PX = 24;
// The gap between a multiple-selection cell's chips.
const CHIP_GAP_PX = 4;
// The room an arrow dropdown keeps at its cell's right (as a card table's column does).
export const RULE_ARROW_PX = 22;
const INVALID_INK = '#dc2626';

type Box = { x: number; y: number; w: number; h: number };

type RuleDraw = {
  // The cell's own text is not drawn (a box or a chip draws it).
  hideText: boolean;
  // The text keeps room at the right for an arrow.
  padEnd: boolean;
  nodes: ReactNode[];
};

const NONE: RuleDraw = { hideText: false, padEnd: false, nodes: [] };

// The chip's and arrow's chevron, and a ticked box's check, in the shared glyphs (currentColor).
const ChevronGlyph = lucideGlyph(lucideChevronDown, 12);
const CheckGlyph = lucideGlyph(lucideCheck, 11);

function Chevron({ colour }: { colour: string }) {
  return (
    <span aria-hidden className="flex items-center" style={{ color: colour }}>
      <ChevronGlyph />
    </span>
  );
}

// The chip's box in its cell, for drawing and for the pointer: from the inset to the text's width and its arrow.
function chipBox(box: Box, textWidth: number, px: number): Box {
  const h = Math.min(box.h - CHIP_PAD_Y, Math.round(px * 1.3) + 6);
  const w = Math.min(
    box.w - CHIP_INSET_PX * 2,
    Math.max(CHIP_ARROW_PX + 8, textWidth * 1.1 + CHIP_TEXT_ROOM_PX + CHIP_ARROW_PX),
  );
  return { x: box.x + CHIP_INSET_PX, y: box.y + (box.h - h) / 2, w, h };
}

// The checkbox's square in its cell.
function checkboxBox(box: Box): Box {
  return {
    x: box.x + (box.w - CHECKBOX_PX) / 2,
    y: box.y + (box.h - CHECKBOX_PX) / 2,
    w: CHECKBOX_PX,
    h: CHECKBOX_PX,
  };
}

// What a press at (x, y) inside a cell's box hits: its checkbox, its dropdown (a chip or an arrow), or nothing.
function ruleTargetAt(
  rule: ValidationRule | null,
  box: Box,
  x: number,
  y: number,
  textWidth: number,
  px: number,
  active: boolean,
): 'box' | 'dropdown' | null {
  if (!rule) return null;
  const inside = (b: Box, slop = 0) =>
    x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop;
  if (rule.is === 'check') return inside(checkboxBox(box), 3) ? 'box' : null;
  if (rule.is !== 'list' && rule.is !== 'range') return null;
  if (!rule.show) return inside(chipBox(box, textWidth, px)) ? 'dropdown' : null;
  // An arrow (always for Arrow, on the active cell for Plain Text).
  if (rule.show === 'plain' && !active) return null;
  return x >= box.x + box.w - RULE_ARROW_PX && inside(box) ? 'dropdown' : null;
}

// The parts a rule draws in its cell.
export function ruleCellDraw(opts: {
  cellKey: string;
  rule: ValidationRule;
  value: Value;
  shown: string;
  textWidth: number;
  box: Box;
  px: number;
  palette: PlanPalette;
  ink: string;
  ctx: RuleCtx;
  // The cell's place, for a Custom Formula Is rule's check.
  at: { r: number; c: number };
  // Text style the chip's text takes (font, weight, decoration).
  textStyle: CSSProperties;
}): RuleDraw {
  const { rule, value, box, palette, cellKey: key } = opts;
  const v = isArray(value) ? scalarOf(value) : value;
  const nodes: ReactNode[] = [];
  const invalid = valueInvalid(rule, value, opts.shown, opts.ctx, opts.at);
  if (invalid)
    nodes.push(
      <div
        key={`${key}iv`}
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: box.x,
          top: box.y,
          width: 0,
          height: 0,
          borderTop: `${INVALID_MARK_PX}px solid ${INVALID_INK}`,
          borderRight: `${INVALID_MARK_PX}px solid transparent`,
          zIndex: 3,
        }}
      />,
    );
  if (rule.is === 'check') {
    const on = isError(v) ? undefined : checkState(rule, v);
    if (on === undefined) return { hideText: false, padEnd: false, nodes };
    const b = checkboxBox(box);
    nodes.push(
      <div
        key={`${key}cb`}
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center rounded-[3px]"
        style={{
          left: b.x,
          top: b.y,
          width: b.w,
          height: b.h,
          zIndex: 1,
          border: `1.5px solid ${on ? palette.focus : palette.muted}`,
          backgroundColor: on ? palette.focus : 'transparent',
        }}
      >
        {on ? (
          <span className="flex items-center text-white">
            <CheckGlyph />
          </span>
        ) : null}
      </div>,
    );
    return { hideText: true, padEnd: false, nodes };
  }
  if (rule.is !== 'list' && rule.is !== 'range') return invalid ? { ...NONE, nodes } : NONE;
  if (rule.show === 'plain') return { hideText: false, padEnd: false, nodes };
  if (rule.show === 'arrow') {
    nodes.push(
      <div
        key={`${key}ar`}
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center"
        style={{
          left: box.x + box.w - RULE_ARROW_PX,
          top: box.y,
          width: RULE_ARROW_PX,
          height: box.h,
          zIndex: 1,
        }}
      >
        <Chevron colour={palette.muted} />
      </div>,
    );
    return { hideText: false, padEnd: true, nodes };
  }
  // Several selections: a chip each, left to right, cut at the cell's edge (data-validation.md "Using a dropdown").
  const parts = rule.multi && typeof v === 'string' ? selectionParts(v) : [];
  if (parts.length > 1) {
    nodes.push(chipRow(opts, parts));
    return { hideText: true, padEnd: false, nodes };
  }
  // A chip: the value on a pill in its option's colour, its ink black or white, whichever reads.
  const option =
    rule.is === 'list' && v !== null && !isError(v) && v !== '' ? optionFor(rule, v) : null;
  const fill = option?.c ?? palette.column;
  const ink = option?.c ? bestInk(fill, '#1f2937', '#ffffff') : opts.ink;
  const empty = v === null || v === '';
  const chip = chipBox(box, empty ? 0 : opts.textWidth, opts.px);
  nodes.push(
    <div
      key={`${key}ch`}
      aria-hidden
      className="pointer-events-none absolute flex items-center gap-1 overflow-hidden rounded-full"
      style={{
        left: chip.x,
        top: chip.y,
        width: chip.w,
        height: chip.h,
        zIndex: 1,
        paddingLeft: empty ? 0 : 8,
        paddingRight: 4,
        justifyContent: empty ? 'center' : 'space-between',
        backgroundColor: empty ? 'transparent' : fill,
        color: ink,
        ...opts.textStyle,
      }}
    >
      {empty ? null : <span className="truncate whitespace-pre">{opts.shown}</span>}
      <span className="flex shrink-0 items-center" style={{ opacity: empty ? 0.6 : 0.9 }}>
        <Chevron colour={empty ? palette.muted : ink} />
      </span>
    </div>,
  );
  return { hideText: true, padEnd: false, nodes };
}

// A pill's colours: its option's, its ink black or white, whichever reads; the quiet column tint without one.
function pillColours(
  rule: ValidationRule,
  text: string,
  palette: PlanPalette,
  ink: string,
): { fill: string; ink: string } {
  const c = rule.is === 'list' ? optionFor(rule, text)?.c : undefined;
  return c ? { fill: c, ink: bestInk(c, '#1f2937', '#ffffff') } : { fill: palette.column, ink };
}

// A multiple-selection cell's chips in a row, the arrow on the last.
function chipRow(opts: Parameters<typeof ruleCellDraw>[0], parts: readonly string[]): ReactNode {
  const { box, palette, rule, cellKey: key } = opts;
  const row = chipBox(box, Number.POSITIVE_INFINITY, opts.px);
  return (
    <div
      key={`${key}cr`}
      aria-hidden
      className="pointer-events-none absolute flex items-center overflow-hidden"
      style={{ left: row.x, top: row.y, width: row.w, height: row.h, gap: CHIP_GAP_PX, zIndex: 1 }}
    >
      {parts.map((part, i) => {
        const { fill, ink } = pillColours(rule, part, palette, opts.ink);
        const last = i === parts.length - 1;
        return (
          <span
            key={i}
            className="flex h-full shrink-0 items-center gap-1 whitespace-pre rounded-full"
            style={{
              paddingLeft: 8,
              paddingRight: last ? 4 : 8,
              backgroundColor: fill,
              color: ink,
              ...opts.textStyle,
            }}
          >
            {part}
            {last ? (
              <span className="flex shrink-0 items-center" style={{ opacity: 0.9 }}>
                <Chevron colour={ink} />
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

// The rough width a cell's chips take: one chip's text, or several chips' with each one's padding and gap.
function chipsTextWidth(rule: ValidationRule | null, shown: string, px: number): number {
  const parts = rule?.multi ? selectionParts(shown) : [];
  if (parts.length < 2) return roughTextWidth(shown, px);
  return parts.reduce((w, p) => w + roughTextWidth(p, px) + 16 + CHIP_GAP_PX, 0);
}

// What a press at a grid point (inside the cells' area, from their origin) hits on a cell's rule, as drawn.
export function ruleHitAt(
  opts: {
    rule: ValidationRule | null;
    box: Box;
    shown: string;
    px: number;
    active: boolean;
  },
  x: number,
  y: number,
): 'box' | 'dropdown' | null {
  return ruleTargetAt(
    opts.rule,
    opts.box,
    x,
    y,
    chipsTextWidth(opts.rule, opts.shown, opts.px),
    opts.px,
    opts.active,
  );
}

// A rough text width, as SheetCells measures (no layout pass): about 0.58em a glyph.
function roughTextWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += /[0-9.,]/.test(ch) ? 0.55 : ch === ' ' ? 0.28 : 0.6;
  return w * px;
}
