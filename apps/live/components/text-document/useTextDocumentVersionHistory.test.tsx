// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Version history": See version history opens the mode for a document stored
// in LiveDoc (dimmed in This Browser), lists the versions, draws the current one and each chosen one read only, says
// when the history or a version cannot be read, and leaves on Back with the writing focused again.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { TextDocumentVersionDto } from '@livedoc/api-schema';
import { TextDocumentState } from '@livedoc/text-documents';
import { base64OfBytes } from '@livedoc/text-documents/base64';
import {
  SEE_VERSION_HISTORY,
  useTextDocumentVersionHistory,
  VERSION_FAILED,
  VERSION_HISTORY_LOCAL_HINT,
} from './useTextDocumentVersionHistory';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  state: vi.fn(),
}));
vi.mock('@/lib/api/text-document-versions', () => ({
  apiListTextDocumentVersions: api.list,
  apiReadTextDocumentVersion: api.read,
}));
vi.mock('@/lib/api/text-documents', () => ({ apiLoadTextDocumentState: api.state }));

afterEach(cleanup);

const where = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: null };

/** A document written in two steps, with the snapshot after the first. */
function written() {
  const doc = new Y.Doc({ gc: false });
  doc.clientID = 5;
  const body = TextDocumentState.body(doc);
  const first = new Y.XmlElement('paragraph');
  first.insert(0, [new Y.XmlText('First words')]);
  body.insert(0, [first]);
  const early = Y.snapshot(doc);
  const second = new Y.XmlElement('paragraph');
  second.insert(0, [new Y.XmlText('Later words')]);
  body.insert(1, [second]);
  return { state: Y.encodeStateAsUpdate(doc), early };
}

const VERSION: TextDocumentVersionDto = {
  id: 'v1',
  kind: 'named',
  name: 'Draft',
  takenAt: Date.now(),
  takenBy: null,
  restoredFrom: null,
  editors: [{ key: 'k', name: 'Ada', color: '#0284c7' }],
};

function Harness({
  local = false,
  onClosed = () => {},
}: {
  local?: boolean;
  onClosed?: () => void;
}) {
  const history = useTextDocumentVersionHistory({
    where,
    local,
    tab: 't.0',
    format: 'odf',
    onClosed,
  });
  const action = history.actions[SEE_VERSION_HISTORY]!;
  return (
    <>
      <button type="button" disabled={action.disabled} onClick={() => action.run()}>
        See version history
      </button>
      {action.hint ? <p>{action.hint}</p> : null}
      {history.mode}
    </>
  );
}

const body = () => screen.getByRole('textbox', { name: 'Document body at this version' });

describe('useTextDocumentVersionHistory', () => {
  let doc: ReturnType<typeof written>;
  beforeEach(() => {
    doc = written();
    api.list.mockReset().mockResolvedValue([VERSION]);
    api.state.mockReset().mockResolvedValue(doc.state);
    api.read.mockReset().mockResolvedValue({
      version: VERSION,
      snapshot: base64OfBytes(Y.encodeSnapshot(doc.early)),
      previous: base64OfBytes(Y.encodeSnapshot(Y.emptySnapshot)),
      clients: { '5': VERSION.editors[0] },
      deletedBy: {},
    });
  });

  it('is dimmed in This Browser, saying why', () => {
    render(<Harness local />);
    expect(
      screen.getByRole('button', { name: 'See version history' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(VERSION_HISTORY_LOCAL_HINT)).toBeTruthy();
  });

  it('opens on the current version, then draws a chosen one read only with its changes', async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.click(screen.getByRole('button', { name: 'See version history' }));
    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeTruthy();
    await waitFor(() => expect(body().textContent).toBe('First wordsLater words'));
    expect(body().getAttribute('aria-readonly')).toBe('true');
    expect(body().querySelector('[data-ychange]')).toBeNull();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(api.read).toHaveBeenCalledWith(where, 'v1');
    await waitFor(() => expect(body().textContent).toBe('First words'));
    expect(body().querySelector('[data-ychange="added"]')?.textContent).toBe('First words');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    await waitFor(() => expect(body().textContent).toBe('First wordsLater words'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClosed).toHaveBeenCalled();
  });

  it('offers to try again when the history cannot be read', async () => {
    api.list.mockRejectedValueOnce(new Error('503'));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'See version history' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(body().textContent).toBe('First wordsLater words'));
  });

  it('says when a version cannot be read, keeping what is drawn', async () => {
    api.read.mockRejectedValueOnce(new Error('404'));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'See version history' }));
    await waitFor(() => expect(body().textContent).toBe('First wordsLater words'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect((await screen.findByRole('status')).textContent).toBe(VERSION_FAILED);
    expect(body().textContent).toBe('First wordsLater words');
  });

  it('drops an answer that came after the mode was left', async () => {
    let answer: (versions: TextDocumentVersionDto[]) => void = () => {};
    api.list.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'See version history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => answer([VERSION]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('selects nothing to read before the state has come', () => {
    api.list.mockReturnValueOnce(new Promise(() => {}));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'See version history' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(api.read).not.toHaveBeenCalled();
  });
});
