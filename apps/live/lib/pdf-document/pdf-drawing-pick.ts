// The drawing tool the toolbar's Drawing holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the
// last of Drawing and Erase a person took from it, kept in their browser for every PDF; Drawing until they take Erase.
// With each tool's menu item, words and glyph, as the Drawing control shows them.
import { lucideEraser, lucidePencilLine } from '@livedoc/icons/lucide';
import { TOOL_DRAWING, TOOL_ERASE } from './pdf-menus';
import { DRAWING_TOOLS } from './pdf-toolbar';
import { createToolPick } from './pdf-tool-pick';
import type { PdfToolControl } from './usePdfToolControl';

/** The tools behind the Drawing control's chevron, in its order. */
export const DRAWING_TOOL_KINDS = ['drawing', 'erase'] as const;
export type DrawingToolKind = (typeof DRAWING_TOOL_KINDS)[number];

const pick = createToolPick<DrawingToolKind>('livedoc:v2:pdf-drawing-tool', DRAWING_TOOL_KINDS);

export const isDrawingTool = pick.holds;
export const drawingPick = pick.read;
export const setDrawingPick = pick.set;
// For tests: forget the pick read so far.
export const resetDrawingPick = pick.reset;

/** The toolbar's Drawing and the tools it holds. */
export const DRAWING_CONTROL: PdfToolControl<DrawingToolKind> = {
  control: DRAWING_TOOLS,
  tools: DRAWING_TOOL_KINDS,
  items: { drawing: TOOL_DRAWING, erase: TOOL_ERASE },
  labels: { drawing: 'Drawing', erase: 'Erase' },
  icons: { drawing: lucidePencilLine, erase: lucideEraser },
  pick,
  usePick: pick.use,
};
