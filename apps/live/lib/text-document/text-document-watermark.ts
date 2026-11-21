// The watermark (docs/specs/034-text-documents/page-layout.md "Watermark"): set or taken away as one step of the body's
// undo, and how each page draws it: its box as the files write it, its words in its font, colour and transparency,
// turned to the diagonal, rising from the bottom left.
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { DocumentFonts } from '@livedoc/document';
import {
  TextDocumentState,
  watermarkBox,
  Watermarks,
  type PageSetup,
  type Watermark,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

/** The Size menu's points, after Auto (default). */
export const WATERMARK_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96, 144] as const;

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sets the watermark (none takes it away) as one undo step; false when nothing changed (then no step is made). */
export function applyWatermark(view: EditorView, doc: Y.Doc, next: Watermark | undefined): boolean {
  if (same(TextDocumentState.watermark(doc), next)) return false;
  startUndoStep(view);
  TextDocumentState.setWatermark(doc, next, TEXT_DOCUMENT_PAGE_ORIGIN);
  startUndoStep(view);
  debugLog('[text-document] watermark', {
    change: next ? 'set' : 'removed',
    layout: next?.layout,
    size: next?.size ?? 'auto',
  });
  return true;
}

/** How a page draws a watermark, in CSS pixels; null for none, or one without words. */
export type WatermarkLook = {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  /** Auto: the words stretched across the box, as the files' text path fits its shape. */
  readonly fit: boolean;
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly colour: string;
  readonly opacity: number;
  /** Degrees, clockwise: -45 rises from the bottom left. */
  readonly rotate: number;
};

export function watermarkLook(
  watermark: Watermark | undefined,
  setup: PageSetup,
): WatermarkLook | null {
  if (!Watermarks.draws(watermark)) return null;
  const box = watermarkBox(watermark, setup.width - setup.margins.left - setup.margins.right);
  return {
    text: watermark.text,
    width: box.width * PX_PER_PT,
    height: box.height * PX_PER_PT,
    fontSize: (watermark.size ?? box.height) * PX_PER_PT,
    fit: watermark.size === undefined,
    family: DocumentFonts.stack(watermark.font),
    bold: watermark.bold === true,
    italic: watermark.italic === true,
    colour: watermark.colour,
    opacity: Math.round((1 - watermark.transparency) * 100) / 100,
    rotate: watermark.layout === 'diagonal' ? -45 : 0,
  };
}
