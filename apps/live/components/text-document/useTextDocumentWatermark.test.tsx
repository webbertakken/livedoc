// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Watermark": the document's watermark read live (anyone's change, an
// undo), set by an Editor as one undo step, counted only when it changed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import { TextDocumentState, Watermarks } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { useTextDocumentWatermark } from './useTextDocumentWatermark';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

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

afterEach(() => {
  view.destroy();
  vi.mocked(track).mockClear();
});

const hook = (writes = true) =>
  renderHook(() =>
    useTextDocumentWatermark({ view, liveDoc: { current: doc }, ready: true, writes }),
  );

describe('useTextDocumentWatermark', () => {
  it("reads another person's change, and sets one counted once", () => {
    const { result } = hook();
    expect(result.current.watermark).toBeUndefined();
    act(() => TextDocumentState.setWatermark(doc, Watermarks.text('PEER')));
    expect(result.current.watermark?.text).toBe('PEER');
    act(() => result.current.apply(Watermarks.text('DRAFT')));
    expect(result.current.watermark?.text).toBe('DRAFT');
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentWatermark');
    act(() => result.current.apply(Watermarks.text('DRAFT')));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('changes nothing for a session that does not write', () => {
    const { result } = hook(false);
    act(() => result.current.apply(Watermarks.text('DRAFT')));
    expect(TextDocumentState.watermark(doc)).toBeUndefined();
  });
});
