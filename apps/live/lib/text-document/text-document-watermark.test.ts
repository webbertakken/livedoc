// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Watermark": set and taken away as one undo step each; drawn at the size the
// files write it, in its font, colour and transparency, on the diagonal or level.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';
import { PageSetup, TextDocumentState, Watermarks } from '@livedoc/text-documents';
import { applyWatermark, watermarkLook } from './text-document-watermark';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;

beforeEach(async () => {
  doc = TextDocumentState.load();
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => view.destroy());

const undo = () => yUndoPluginKey.getState(view.state)!.undoManager.undo();

describe('applyWatermark', () => {
  it('sets one and takes it away, one undo step each, none when nothing changes', () => {
    const draft = Watermarks.text('DRAFT');
    expect(applyWatermark(view, doc, draft)).toBe(true);
    expect(TextDocumentState.watermark(doc)).toEqual(draft);
    expect(applyWatermark(view, doc, draft)).toBe(false);
    expect(applyWatermark(view, doc, { ...draft, layout: 'horizontal' })).toBe(true);
    undo();
    expect(TextDocumentState.watermark(doc)).toEqual(draft);
    expect(applyWatermark(view, doc, undefined)).toBe(true);
    expect(TextDocumentState.watermark(doc)).toBeUndefined();
    undo();
    expect(TextDocumentState.watermark(doc)).toEqual(draft);
  });
});

describe('watermarkLook', () => {
  const letter = PageSetup.of('letter');

  it('draws Auto across 90% of the text width, stretched, on the diagonal', () => {
    const look = watermarkLook(Watermarks.text('DRAFT'), letter)!;
    // 6.5 in of text: 468 pt, 421.2 pt across, in pixels.
    expect(look.width).toBeCloseTo(421.2 * (96 / 72));
    expect(look.fit).toBe(true);
    expect(look.rotate).toBe(-45);
    expect(look.opacity).toBe(0.5);
    expect(look.colour).toBe('#c0c0c0');
    expect(look.family).toContain('Arial');
  });

  it('draws a size at that size, level, bold and italic', () => {
    const look = watermarkLook(
      {
        ...Watermarks.text('Copy'),
        size: 36,
        bold: true,
        italic: true,
        layout: 'horizontal',
        transparency: 0.2,
      },
      letter,
    )!;
    expect(look.fontSize).toBe(48);
    expect(look.fit).toBe(false);
    expect([look.bold, look.italic, look.rotate, look.opacity]).toEqual([true, true, 0, 0.8]);
  });

  it('draws none without words', () => {
    expect(watermarkLook(undefined, letter)).toBeNull();
    expect(watermarkLook(Watermarks.text(' '), letter)).toBeNull();
  });
});
