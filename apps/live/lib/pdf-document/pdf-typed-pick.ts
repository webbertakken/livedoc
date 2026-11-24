// The typing tool the toolbar's Text holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last of
// Text and Callout a person took from it, kept in their browser for every PDF; Text until they take another. With
// each tool's menu item, words and glyph, as the Text control shows them.
import { lucideMessageSquareText, lucideType } from '@livedoc/icons/lucide';
import { TYPED_MARK_KINDS, type TypedMarkKind } from '@livedoc/pdf-documents';
import { TOOL_CALLOUT, TOOL_TEXT } from './pdf-menus';
import { TYPED_TOOLS } from './pdf-toolbar';
import { createToolPick } from './pdf-tool-pick';
import type { PdfToolControl } from './usePdfToolControl';

const pick = createToolPick<TypedMarkKind>('livedoc:v2:pdf-typed-tool', TYPED_MARK_KINDS);

export const isTypedTool = pick.holds;
export const setTypedPick = pick.set;
// For tests: forget the pick read so far.
export const resetTypedPick = pick.reset;

/** The toolbar's Text and the tools it holds. */
export const TYPED_CONTROL: PdfToolControl<TypedMarkKind> = {
  control: TYPED_TOOLS,
  tools: TYPED_MARK_KINDS,
  items: { text: TOOL_TEXT, callout: TOOL_CALLOUT },
  labels: { text: 'Text', callout: 'Callout' },
  icons: { text: lucideType, callout: lucideMessageSquareText },
  pick,
  usePick: pick.use,
};
