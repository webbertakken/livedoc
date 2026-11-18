// The Sankey diagram's wire (docs/specs/009-elements/sankey.md): flows between named nodes, the options that change
// how they draw, the bounds a stored diagram is held to, and its defaults. What validating, normalising and making a
// Sankey needs, apart from reading and editing its flows (sankey-model.ts), which loads with the charts family
// (docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it").
//
// A LEAF module (it imports only types), like data-shapes.ts, so factories.ts can seed a new diagram from
// SANKEY_DEFAULT_FLOWS at module-init time without walking into the index <-> factories cycle.

import type { ShapeKind } from './shape-kind';

/** One flow: `value` of something moving from the node named `from` to the node named `to`. */
export type SankeyFlow = { from: string; to: string; value: number };

/** A node's stored look. Only a node somebody recoloured has one; the rest take the palette by order. */
/**
 * A node's own settings, by name: its colour, and `leftover: false` when its leftover is switched off (only
 * `false` is ever stored; absent means it draws one while the diagram shows leftovers).
 */
export type SankeyNodeStyle = { name: string; color?: string; leftover?: boolean };

/** How a flow's band is coloured: its source node, its target node, a blend of both, or one quiet grey. */
export type SankeyLinkColor = 'source' | 'target' | 'gradient' | 'neutral';
export const SANKEY_LINK_COLORS: readonly SankeyLinkColor[] = [
  'gradient',
  'source',
  'target',
  'neutral',
];
export const SANKEY_LINK_COLOR_LABELS: Record<SankeyLinkColor, string> = {
  gradient: 'Blend',
  source: 'From',
  target: 'To',
  neutral: 'Grey',
};

/** Where the end nodes sit: every end node in the last column, or each node at its own step from the start. */
export type SankeyAlign = 'justify' | 'left';
export const SANKEY_ALIGNS: readonly SankeyAlign[] = ['justify', 'left'];
export const SANKEY_ALIGN_LABELS: Record<SankeyAlign, string> = {
  justify: 'Ends Right',
  left: 'By Step',
};

/** What a node's label says under its name. */
export type SankeyValueLabel = 'value' | 'percent' | 'none';
export const SANKEY_VALUE_LABELS: readonly SankeyValueLabel[] = ['value', 'percent', 'none'];
export const SANKEY_VALUE_LABEL_LABELS: Record<SankeyValueLabel, string> = {
  value: 'Amount',
  percent: 'Percent',
  none: 'Names Only',
};

/** The entrance and ambient motion: bands sweep in once, or a soft current runs along them. */
/** Whether a node that sends on less than it receives draws the difference as a band to a Leftover node. */
export type SankeyLeftover = 'show' | 'hide';
export const SANKEY_LEFTOVERS: readonly SankeyLeftover[] = ['show', 'hide'];
export const SANKEY_LEFTOVER_LABELS: Record<SankeyLeftover, string> = {
  show: 'Show',
  hide: 'Hide',
};
/** The end node leftovers run to, unless the diagram names it otherwise. */
export const SANKEY_LEFTOVER_NAME = 'Leftover';

/**
 * Grow sweeps the diagram in from the left; Flow runs a current along every band; Cascade brings the columns in
 * one after another; Pulse sends a slow wave of light across the bands; Rise grows each column's nodes, then
 * fades their bands in. Flow and Pulse loop; the rest play once.
 */
export type SankeyAnim = 'grow' | 'flow' | 'cascade' | 'pulse' | 'rise';
export const SANKEY_ANIMS: readonly SankeyAnim[] = ['grow', 'flow', 'cascade', 'pulse', 'rise'];
export const SANKEY_LOOPING_ANIMS: readonly SankeyAnim[] = ['flow', 'pulse'];

// Bounds a stored diagram is held to (validate.ts) and the editor clamps to. 200 flows is far past the
// point a Sankey stops being readable (published ones rarely pass 60); it exists so a pasted spreadsheet
// cannot make every render lay out ten thousand bands.
export const SANKEY_MAX_FLOWS = 200;
export const SANKEY_MAX_NODES = 120;
export const SANKEY_NAME_MAX = 60;
export const SANKEY_UNIT_MAX = 8;
// Values above this are refused: past it, a sum of 200 of them loses whole units in a double.
export const SANKEY_VALUE_MAX = 1e12;
/** In and out closer than this balance: amounts are typed to at most a few decimals. */
export const SANKEY_BALANCE_EPSILON = 1e-9;

// A household budget: the example everyone reads without being told how. Two incomes pool into the
// budget, which splits into needs, wants and savings, and needs splits again. It shows the three things
// a Sankey does (merge, split, and a second step) with nothing a reader has to decode.
export const SANKEY_DEFAULT_FLOWS: readonly SankeyFlow[] = [
  { from: 'Salary', to: 'Budget', value: 3200 },
  { from: 'Side Work', to: 'Budget', value: 800 },
  { from: 'Budget', to: 'Needs', value: 2000 },
  { from: 'Budget', to: 'Wants', value: 1200 },
  { from: 'Budget', to: 'Savings', value: 800 },
  { from: 'Needs', to: 'Rent', value: 1400 },
  { from: 'Needs', to: 'Groceries', value: 600 },
];

export function isSankeyShape(kind: ShapeKind): boolean {
  return kind === 'sankey';
}

/** A node name as it is matched and stored: trimmed, inner whitespace collapsed, capped. */
export function cleanSankeyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, SANKEY_NAME_MAX);
}
