// The shape tool the toolbar's Shape holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last of
// Line, Arrow, Rectangle and Ellipse a person took from it, kept in their browser for every PDF; Line until they take
// another.
import { LINE_MARK_KINDS, SHAPE_MARK_KINDS } from '@livedoc/pdf-documents';
import { createToolPick } from './pdf-tool-pick';

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
