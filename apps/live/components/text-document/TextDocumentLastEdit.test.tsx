// @vitest-environment jsdom
// editing-surface.md "The title row" (Last edit): read as the details open, a link to version history; nothing until
// read, nothing when it cannot be.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextDocumentLastEdit } from './TextDocumentLastEdit';

const api = vi.hoisted(() => ({ lastEdit: vi.fn() }));
vi.mock('@/lib/api/text-document-versions', () => ({ apiReadTextDocumentLastEdit: api.lastEdit }));

afterEach(cleanup);

const where = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: null };
const now = () => 1_000_000;

describe('TextDocumentLastEdit', () => {
  it('reads the last edit and opens version history from it', async () => {
    api.lastEdit.mockResolvedValueOnce({
      at: 1_000_000 - 120_000,
      editor: { key: 'k', name: 'Ada', color: null },
    });
    const onOpen = vi.fn();
    render(<TextDocumentLastEdit where={where} onOpen={onOpen} now={now} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Last edit was 2 minutes ago by Ada' }),
    );
    expect(onOpen).toHaveBeenCalled();
    expect(api.lastEdit).toHaveBeenCalledWith(where);
  });

  it('says nothing before any edit, when it cannot be read, or once gone', async () => {
    api.lastEdit.mockResolvedValueOnce(null);
    const { container, unmount } = render(<TextDocumentLastEdit where={where} onOpen={() => {}} />);
    await waitFor(() => expect(api.lastEdit).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe('');
    unmount();
    api.lastEdit.mockRejectedValueOnce(new Error('403'));
    render(<TextDocumentLastEdit where={where} onOpen={() => {}} />);
    await waitFor(() => expect(api.lastEdit).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button')).toBeNull();
    let answer: (v: unknown) => void = () => {};
    api.lastEdit.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const late = render(<TextDocumentLastEdit where={where} onOpen={() => {}} />);
    late.unmount();
    answer({ at: 0, editor: { key: null, name: null, color: null } });
  });
});
