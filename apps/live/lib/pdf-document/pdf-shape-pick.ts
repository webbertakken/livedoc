// The shape tool the toolbar's Shape holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last of
// Line, Arrow, Rectangle and Ellipse a person took from it, kept in their browser for every PDF; Line until they take
// another. With each tool's menu item, words and glyph, as the Shape control shows them.
import {
  lucideArrowUpRight,
  lucideCircle,
  lucideRectangleHorizontal,
  lucideSlash,
} from '@livedoc/icons/lucide';
import { LINE_MARK_KINDS, SHAPE_MARK_KINDS } from '@livedoc/pdf-documents';
import { TOOL_ARROW, TOOL_ELLIPSE, TOOL_LINE, TOOL_RECTANGLE } from './pdf-menus';
import { SHAPE_TOOLS } from './pdf-toolbar';
import { createToolPick } from './pdf-tool-pick';
import type { PdfToolControl } from './usePdfToolControl';

/** The tools behind the Shape control's chevron, in its order, which ⇧D steps through. */
export const SHAPE_TOOL_KINDS = [...LINE_MARK_KINDS, ...SHAPE_MARK_KINDS] as const;
export type ShapeToolKind = (typeof SHAPE_TOOL_KINDS)[number];

const pick = createToolPick<ShapeToolKind>('livedoc:v2:pdf-shape-tool', SHAPE_TOOL_KINDS);

export const isShapeTool = pick.holds;
export const shapePick = pick.read;
export const setShapePick = pick.set;
export const useShapePick = pick.use;
// For tests: forget the pick read so far.
export const resetShapePick = pick.reset;

/** The toolbar's Shape and the tools it holds. */
export const SHAPE_CONTROL: PdfToolControl<ShapeToolKind> = {
  control: SHAPE_TOOLS,
  tools: SHAPE_TOOL_KINDS,
  items: { line: TOOL_LINE, arrow: TOOL_ARROW, rectangle: TOOL_RECTANGLE, ellipse: TOOL_ELLIPSE },
  labels: { line: 'Line', arrow: 'Arrow', rectangle: 'Rectangle', ellipse: 'Ellipse' },
  icons: {
    line: lucideSlash,
    arrow: lucideArrowUpRight,
    rectangle: lucideRectangleHorizontal,
    ellipse: lucideCircle,
  },
  pick,
  usePick: pick.use,
};
