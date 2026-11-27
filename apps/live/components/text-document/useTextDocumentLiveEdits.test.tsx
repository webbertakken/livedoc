// @vitest-environment jsdom
// docs/specs/034-text-documents/tools.md "Accessibility settings", Show live edits: while the panel is open, the room's
// changes to the writing are listed by their sender, an author's run joined, the newest read once it settles; nothing
// is heard while it is closed, from this browser's own writing, or from a change the room did not name a sender for.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { applyRoomUpdate } from '@/lib/live-tab/live-tab-room-binding';
import {
  resetTextDocumentPeers,
  syncTextDocumentPeople,
} from '@/lib/text-document/text-document-carets-store';
import { LIVE_EDIT_JOIN_MS } from '@/lib/text-document/text-document-live-edits';
import { TextDocumentLiveEditsPanel, LIVE_EDITS_EMPTY } from './TextDocumentLiveEditsPanel';
import { SOMEONE, useTextDocumentLiveEdits } from './useTextDocumentLiveEdits';

const views: EditorView[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  syncTextDocumentPeople([{ id: 'p-ada', name: 'Ada', color: '#f00' }]);
});
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  resetTextDocumentPeers();
  vi.useRealTimers();
});

/** A reader's editor bound to its writing, and a writer whose changes reach it through the room. */
function setup(open: boolean) {
  const writer = new Y.Doc();
  const text = new Y.XmlText();
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [text]);
  writer.getXmlFragment('body').insert(0, [paragraph]);
  const reader = new Y.Doc();
  Y.applyUpdate(reader, Y.encodeStateAsUpdate(writer));
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(reader.getXmlFragment('body'))],
    }),
  });
  views.push(view);
  const send = (edit: (t: Y.XmlText) => void, from: string | undefined) => {
    const before = Y.encodeStateVector(reader);
    writer.transact(() => edit(text));
    act(() => applyRoomUpdate(reader, Y.encodeStateAsUpdate(writer, before), from));
  };
  function Harness({ shown }: { shown: boolean }) {
    const { entries, said } = useTextDocumentLiveEdits({ view, open: shown });
    return <TextDocumentLiveEditsPanel entries={entries} said={said} />;
  }
  const { rerender } = render(<Harness shown={open} />);
  return { send, view, reader, reopen: (shown: boolean) => rerender(<Harness shown={shown} />) };
}

const items = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
const region = () => screen.getByRole('status').textContent;

describe('useTextDocumentLiveEdits', () => {
  it('lists the room’s changes by sender, joins a run, and reads the newest once it settles', () => {
    const { send } = setup(true);
    expect(screen.getByText(LIVE_EDITS_EMPTY)).toBeTruthy();
    send((t) => t.insert(0, 'the '), 'p-ada');
    send((t) => t.insert(4, 'plan'), 'p-ada');
    expect(items()).toEqual(['Ada added “the plan”']);
    expect(region()).toBe('');
    act(() => {
      vi.advanceTimersByTime(LIVE_EDIT_JOIN_MS);
    });
    expect(region()).toBe('Ada added “the plan”');
    send((t) => t.delete(0, 4), 'p-gone');
    expect(items()).toEqual([`${SOMEONE} removed “the”`, 'Ada added “the plan”']);
  });

  it('hears nothing unnamed, nothing of its own, and nothing while closed', () => {
    const { send, view, reopen } = setup(true);
    send((t) => t.insert(0, 'x'), undefined);
    view.dispatch(view.state.tr.insertText('mine', 1));
    expect(items()).toEqual([]);
    reopen(false);
    send((t) => t.insert(0, 'y'), 'p-ada');
    reopen(true);
    expect(items()).toEqual([]);
  });

  it('forgets the list once closed', () => {
    const { send, reopen } = setup(true);
    send((t) => t.insert(0, 'z'), 'p-ada');
    expect(items()).toHaveLength(1);
    reopen(false);
    reopen(true);
    expect(items()).toEqual([]);
  });
});
