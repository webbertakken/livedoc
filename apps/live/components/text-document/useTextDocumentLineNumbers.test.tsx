// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Line numbers" (The panel): the caret's section's line numbers read live,
// a choice applied over the caret's section, counted only when it changed something, and only for an Editor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { useTextDocumentLineNumbers } from './useTextDocumentLineNumbers';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;
let listeners: Set<() => void>;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notify = () => act(() => listeners.forEach((l) => l()));

beforeEach(async () => {
  listeners = new Set();
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  const later = new Y.XmlElement('section_break');
  later.setAttribute('start', 'next-page');
  later.setAttribute('setup', PageSetup.of('a4') as never);
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [new Y.XmlElement('paragraph'), later, new Y.XmlElement('paragraph')]);
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(body), ...textDocumentUndoPlugins()],
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
    useTextDocumentLineNumbers({
      view,
      liveDoc: { current: doc },
      format: 'odf',
      writes,
      first: TextDocumentState.section(doc, 'odf'),
      subscribe,
    }),
  );

// Into the second section's paragraph.
const toLastSection = () =>
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, view.state.doc.content.size - 1),
    ),
  );

describe('useTextDocumentLineNumbers', () => {
  it("reads every section's numbers and the caret's section as it moves", () => {
    const { result } = hook();
    expect(result.current.state).toEqual({ own: [undefined, undefined], section: 0 });
    toLastSection();
    notify();
    expect(result.current.state.section).toBe(1);
  });

  it("applies a choice over the caret's section and counts it once", () => {
    const { result } = hook();
    toLastSection();
    act(() => result.current.choose({ scope: 'section', shown: true, restart: 'page' }));
    notify();
    expect(result.current.state.own).toEqual([undefined, { restart: 'page' }]);
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentLineNumbers');
    act(() => result.current.choose({ scope: 'section', shown: true, restart: 'page' }));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('changes nothing for a session that does not write', () => {
    const { result } = hook(false);
    act(() => result.current.choose({ scope: 'document', shown: true, restart: 'page' }));
    expect(TextDocumentState.section(doc, 'odf').lineNumbers).toBeUndefined();
    expect(track).not.toHaveBeenCalled();
  });
});
