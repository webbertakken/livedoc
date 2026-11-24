// @vitest-environment jsdom
// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": Copy To › Existing Spreadsheet's picker (D183).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { apiListDocuments } from '@/lib/api/documents';
import { CopyToDialog, copyTargets } from './CopyToDialog';

vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn() }));

const doc = (id: string, name: string, spreadsheet: boolean) =>
  ({ id, name, ...(spreadsheet ? { spreadsheet: true } : {}) }) as DocumentSummary;
const documents = [
  doc('here', 'This one', true),
  doc('b1', 'Budget 2027', true),
  doc('d1', 'A diagram', false),
  doc('p1', 'Plans', true),
];

function open(onPick = vi.fn(), onClose = vi.fn()) {
  render(
    <CopyToDialog
      ownerId="o"
      currentId="here"
      sheetName="Costs"
      onPick={onPick}
      onClose={onClose}
    />,
  );
  return { onPick, onClose };
}

describe('CopyToDialog', () => {
  it('lists the other spreadsheets, narrowed by a search, and picks one', async () => {
    vi.mocked(apiListDocuments).mockResolvedValueOnce(documents);
    const { onPick, onClose } = open();
    expect(screen.getByRole('status').textContent).toBe('Loading your spreadsheets…');
    expect(await screen.findByRole('button', { name: 'Budget 2027' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'A diagram' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'This one' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search spreadsheets' }), {
      target: { value: 'PLA' },
    });
    expect(screen.queryByRole('button', { name: 'Budget 2027' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plans' }));
    expect(onPick).toHaveBeenCalledWith({ documentId: 'p1', name: 'Plans' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search spreadsheets' }), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No spreadsheet is called that.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says when there is none, and when the list failed, trying again', async () => {
    vi.mocked(apiListDocuments).mockResolvedValueOnce([doc('here', 'This one', true)]);
    const { unmount } = render(
      <CopyToDialog
        ownerId="o"
        currentId="here"
        sheetName="Costs"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('You have no other spreadsheets yet.')).toBeTruthy();
    unmount();
    vi.mocked(apiListDocuments).mockRejectedValueOnce(new Error('offline'));
    open();
    expect((await screen.findByRole('alert')).textContent).toContain('could not be listed');
    vi.mocked(apiListDocuments).mockResolvedValueOnce(documents);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByRole('button', { name: 'Plans' })).toBeTruthy();
  });

  it('lands nothing once closed', async () => {
    let resolve!: (d: DocumentSummary[]) => void;
    vi.mocked(apiListDocuments).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = render(
      <CopyToDialog
        ownerId="o"
        currentId="here"
        sheetName="Costs"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    first.unmount();
    await act(async () => resolve(documents));
    let reject!: (e: unknown) => void;
    vi.mocked(apiListDocuments).mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = render(
      <CopyToDialog
        ownerId="o"
        currentId="here"
        sheetName="Costs"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    second.unmount();
    await act(async () => reject(new Error('late')));
    expect(copyTargets(documents, 'here').map((d) => d.id)).toEqual(['b1', 'p1']);
  });
});
