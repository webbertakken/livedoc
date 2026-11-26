// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The dialog": the person's own text documents but this one, newest first,
// searched; the attribution and the comments box; Compare waits for a choice; a refusal said, the choices kept; ready
// with Open and Close.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { apiListDocuments } from '@/lib/api/documents';
import { TextDocumentCompareDialog, compareTargets } from './TextDocumentCompareDialog';

vi.mock('@/lib/api/documents', async (original) => ({
  ...(await original<typeof import('@/lib/api/documents')>()),
  apiListDocuments: vi.fn(),
}));

const doc = (id: string, name: string, savedAt: number, text = true): DocumentSummary =>
  ({
    id,
    name,
    savedAt,
    ...(text ? { textDocument: true } : {}),
  }) as unknown as DocumentSummary;

const DOCUMENTS = [
  doc('here', 'This one', 5),
  doc('a', 'Alpha draft', 1),
  doc('b', 'Beta draft', 3),
  doc('c', 'A canvas', 4, false),
];

function draw(onCompare = vi.fn().mockResolvedValue({ ok: true, documentId: 'new' })) {
  vi.mocked(apiListDocuments).mockResolvedValueOnce(DOCUMENTS);
  const onClose = vi.fn();
  const onOpen = vi.fn();
  render(
    <TextDocumentCompareDialog
      ownerId="me"
      currentId="here"
      documentName="This one"
      defaultName="Ada"
      onCompare={onCompare}
      onOpen={onOpen}
      onClose={onClose}
    />,
  );
  return { onCompare, onClose, onOpen };
}

afterEach(cleanup);

describe('compareTargets', () => {
  it('lists the person’s other text documents, newest first', () => {
    expect(compareTargets(DOCUMENTS, 'here').map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('TextDocumentCompareDialog', () => {
  it('lists the text documents to choose from and narrows them by name', async () => {
    draw();
    expect(await screen.findByRole('radio', { name: 'Beta draft' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'A canvas' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'This one' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search your text documents' }), {
      target: { value: 'alp' },
    });
    expect(screen.queryByRole('radio', { name: 'Beta draft' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Alpha draft' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search your text documents' }), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No text documents match')).toBeTruthy();
  });

  it('says suggestions are left out and waits for a document chosen', async () => {
    const { onCompare } = draw();
    await screen.findByRole('radio', { name: 'Beta draft' });
    expect(screen.getByText('Suggestions in either document are left out.')).toBeTruthy();
    const compare = screen.getByRole<HTMLButtonElement>('button', { name: 'Compare' });
    expect(compare.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Beta draft' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Attribute differences to' }), {
      target: { value: 'Reviewer' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include comments from the selected document' }),
    );
    await act(async () => fireEvent.click(compare));
    expect(onCompare).toHaveBeenCalledWith({
      selected: { id: 'b', name: 'Beta draft' },
      name: 'Reviewer',
      comments: true,
    });
  });

  it('offers Open once the comparison is ready', async () => {
    const { onOpen, onClose } = draw();
    fireEvent.click(await screen.findByRole('radio', { name: 'Alpha draft' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Compare' })));
    expect(screen.getByText('Comparison ready')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('new');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says a refusal and keeps the choices for another try', async () => {
    draw(vi.fn().mockResolvedValue({ ok: false, refusal: 'not-copyable' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Alpha draft' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Compare' })));
    expect(screen.getByRole('alert').textContent).toBe(
      "You can't copy Alpha draft, so it can't be compared.",
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Alpha draft' }).checked).toBe(true);
  });

  it('says Comparing… while it works', async () => {
    let finish: (value: unknown) => void = () => {};
    draw(vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))));
    fireEvent.click(await screen.findByRole('radio', { name: 'Alpha draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    const busy = screen.getByRole<HTMLButtonElement>('button', { name: 'Comparing…' });
    expect(busy.disabled).toBe(true);
    await act(async () => finish({ ok: true, documentId: 'x' }));
  });

  it('says when the list fails, and tries again', async () => {
    vi.mocked(apiListDocuments).mockRejectedValueOnce(new Error('offline'));
    render(
      <TextDocumentCompareDialog
        ownerId="me"
        currentId="here"
        documentName="This one"
        defaultName=""
        onCompare={vi.fn()}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('Your text documents could not be listed.')).toBeTruthy();
    vi.mocked(apiListDocuments).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You have no other text documents yet.')).toBeTruthy();
  });
});
