// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Threads in the margin": a card's comments, "From the file" under a file's
// author, "Original content deleted" with the quote, Resolve for whoever comments, Edit and Delete on one's own, Delete
// on any for an Editor, nothing for a reader, Reply while selected, and a confirmation before the thread goes.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TextDocumentThread } from '@livedoc/text-documents';
import { cardLabel, TextDocumentDraftCard, TextDocumentThreadCard } from './TextDocumentThreadCard';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const thread: TextDocumentThread = {
  id: 't1',
  tab: 't.0',
  start: new Uint8Array(),
  end: new Uint8Array(),
  quote: 'quarterly results',
  resolved: false,
  comments: [
    { id: 'c1', text: 'Is this final?', at: 1, author: ADA },
    { id: 'c2', text: 'Yes.', at: 2, author: BEN },
    {
      id: 'c3',
      text: 'From Word.',
      at: 3,
      author: { name: 'Cy', colour: '#6b7280', fromFile: true },
    },
  ],
};
const as = (who: typeof ADA, mayDeleteAny = false): TextDocumentCommenter => ({
  ...who,
  mayDeleteAny,
});

function card(
  commenter: TextDocumentCommenter | null,
  extra: Partial<Parameters<typeof TextDocumentThreadCard>[0]> = {},
) {
  const props = {
    thread,
    deleted: false,
    selected: false,
    commenter,
    onSelect: vi.fn(),
    onReply: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onResolve: vi.fn(),
    ...extra,
  };
  render(<TextDocumentThreadCard {...props} />);
  return props;
}

const rowOf = (text: string) => screen.getByText(text).closest('li')!;

describe('TextDocumentThreadCard', () => {
  it('names itself by its first author and quote, and marks a file’s comment', () => {
    card(null);
    expect(
      screen.getByRole('group', { name: 'Comment by Ada on “quarterly results”' }),
    ).toBeTruthy();
    expect(within(rowOf('From Word.')).getByText('From the file')).toBeTruthy();
    expect(within(rowOf('Yes.')).queryByText('From the file')).toBeNull();
  });

  it('offers a reader nothing to change', () => {
    card(null);
    expect(
      screen.queryByRole('button', { name: /Resolve|Edit comment|Delete comment/ }),
    ).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers Edit and Delete on one’s own comments alone, and Resolve', () => {
    const props = card(as(BEN));
    expect(within(rowOf('Yes.')).getByRole('button', { name: 'Edit comment' })).toBeTruthy();
    expect(
      within(rowOf('Is this final?')).queryByRole('button', { name: 'Edit comment' }),
    ).toBeNull();
    expect(
      within(rowOf('Is this final?')).queryByRole('button', { name: 'Delete comment' }),
    ).toBeNull();
    fireEvent.click(within(rowOf('Yes.')).getByRole('button', { name: 'Delete comment' }));
    expect(props.onRemove).toHaveBeenCalledWith('c2');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(props.onResolve).toHaveBeenCalledWith(true);
  });

  it('edits a comment in place: Save keeps the new text, Cancel the old', () => {
    const props = card(as(BEN));
    fireEvent.click(within(rowOf('Yes.')).getByRole('button', { name: 'Edit comment' }));
    const field = screen.getByRole('textbox', { name: 'Edit comment' });
    fireEvent.change(field, { target: { value: 'Yes, final.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onEdit).toHaveBeenCalledWith('c2', 'Yes, final.');
    fireEvent.click(within(rowOf('Yes.')).getByRole('button', { name: 'Edit comment' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit comment' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Edit comment' })).toBeNull();
    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it('lets an Editor delete any comment, asking first when it is the thread’s first', () => {
    const props = card(as(BEN, true));
    fireEvent.click(within(rowOf('From Word.')).getByRole('button', { name: 'Delete comment' }));
    expect(props.onRemove).toHaveBeenCalledWith('c3');
    fireEvent.click(
      within(rowOf('Is this final?')).getByRole('button', { name: 'Delete comment' }),
    );
    expect(props.onRemove).not.toHaveBeenCalledWith('c1');
    expect(screen.getByText('Delete this comment thread?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onRemove).toHaveBeenCalledWith('c1');
  });

  it('selects itself when pressed, and offers Reply once selected', () => {
    const props = card(as(ADA));
    fireEvent.click(screen.getByText('Yes.'));
    expect(props.onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).toBeNull();
    cleanup();
    const selected = card(as(ADA), { selected: true });
    const field = screen.getByRole('textbox', { name: 'Add a comment' });
    fireEvent.change(field, { target: { value: 'Thanks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(selected.onReply).toHaveBeenCalledWith('Thanks');
    expect(screen.getByRole('group', { current: true })).toBeTruthy();
  });

  it('leads with “Original content deleted” and the quote once the text is gone', () => {
    card(null, { deleted: true });
    expect(screen.getByText('Original content deleted')).toBeTruthy();
    expect(screen.getByText('quarterly results')).toBeTruthy();
  });

  it('names a long quote by its start, and a thread with no quote by its author', () => {
    expect(cardLabel({ ...thread, quote: 'x'.repeat(50) })).toBe(
      `Comment by Ada on “${'x'.repeat(40)}…”`,
    );
    expect(cardLabel({ ...thread, quote: '' })).toBe('Comment by Ada');
    expect(cardLabel({ ...thread, quote: '', comments: [] })).toBe('Comment by someone');
  });
});

describe('TextDocumentDraftCard', () => {
  it('focuses its field, sends with Comment, and drops with Cancel or Escape', async () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    render(<TextDocumentDraftCard commenter={as(ADA)} onSend={onSend} onCancel={onCancel} />);
    const field = screen.getByRole('textbox', { name: 'Add a comment' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    fireEvent.change(field, { target: { value: 'Check this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(onSend).toHaveBeenCalledWith('Check this');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
