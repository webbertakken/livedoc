// @vitest-environment jsdom
// docs/specs/029-sheets/settings.md "Spreadsheet settings" (D512): File › Settings opens on the settings as they are,
// names the cards' document from the Editor's own, saves whole as one undo step, waits on a field out of range and
// says when a save failed.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { WorkbookRecord } from '@livedoc/sheets';
import { apiListDocuments } from '@/lib/api/documents';
import { apiSaveWorkbookSettings } from '@/lib/api/workbook';
import { MAX_ITERATIONS_INVALID } from '@/lib/spreadsheet/spreadsheet-settings';
import { SpreadsheetSettings } from './SpreadsheetSettings';
import { SETTINGS_NOT_SAVED } from './SpreadsheetSettingsDialog';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({ apiSaveWorkbookSettings: vi.fn() }));
vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const SCOPE = { ownerId: 'o1', documentId: 'book', shareCode: null };
const RECORD = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const SETTINGS = RECORD.settings;
const doc = (id: string, name: string, savedAt: number, extra: Partial<DocumentSummary> = {}) =>
  ({ id, name, savedAt, ...extra }) as DocumentSummary;

function open(settings = SETTINGS) {
  const onWorkbook = vi.fn();
  const pushUndo = vi.fn();
  const onClose = vi.fn();
  render(
    <SpreadsheetSettings
      scope={SCOPE}
      settings={settings}
      onWorkbook={onWorkbook}
      pushUndo={pushUndo}
      onClose={onClose}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Settings for This Spreadsheet' });
  return { dialog, onWorkbook, pushUndo, onClose };
}

const save = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Settings' }));

describe('SpreadsheetSettings', () => {
  it('names the cards’ document from the Editor’s own Plan documents, and saves it as one undo step', async () => {
    vi.mocked(apiListDocuments).mockResolvedValue([
      doc('plan', 'Roadmap', 2),
      doc('book', 'This one', 3, { spreadsheet: true }),
      doc('notes', 'Notes', 1, { textDocument: true }),
    ]);
    const saved = { ...RECORD, settings: { ...SETTINGS, cardsDocument: 'plan' } };
    vi.mocked(apiSaveWorkbookSettings).mockResolvedValue({ workbook: saved, rev: 2 });
    const { dialog, onWorkbook, pushUndo, onClose } = open();
    const cards = within(dialog).getByRole('combobox', { name: 'Cards From' });
    await waitFor(() =>
      expect(
        within(cards)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['None', 'Roadmap']),
    );
    fireEvent.change(cards, { target: { value: 'plan' } });
    save(dialog);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiSaveWorkbookSettings).toHaveBeenCalledWith(SCOPE, saved.settings);
    expect(onWorkbook).toHaveBeenCalledWith(saved);
    const step = pushUndo.mock.calls[0]![0] as { undo: () => void; redo: () => void };
    step.undo();
    await waitFor(() => expect(apiSaveWorkbookSettings).toHaveBeenLastCalledWith(SCOPE, SETTINGS));
    step.redo();
    await waitFor(() =>
      expect(apiSaveWorkbookSettings).toHaveBeenLastCalledWith(SCOPE, saved.settings),
    );
  });

  it('sets Cards From back to None, and keeps a document not the Editor’s as Another Document', async () => {
    vi.mocked(apiListDocuments).mockResolvedValue([]);
    vi.mocked(apiSaveWorkbookSettings).mockResolvedValue({ workbook: RECORD, rev: 2 });
    const { dialog } = open({ ...SETTINGS, cardsDocument: 'theirs' });
    const cards = within(dialog).getByRole('combobox', { name: 'Cards From' });
    await waitFor(() => expect(within(cards).getByRole('option', { name: 'Another Document' })));
    expect((cards as HTMLSelectElement).value).toBe('theirs');
    fireEvent.change(cards, { target: { value: '' } });
    save(dialog);
    await waitFor(() => expect(apiSaveWorkbookSettings).toHaveBeenCalledWith(SCOPE, SETTINGS));
  });

  it('waits on an iteration field out of range, saying why', async () => {
    vi.mocked(apiListDocuments).mockResolvedValue([]);
    const { dialog } = open();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Calculation' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Iterative Calculation' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Max Number of Iterations' }), {
      target: { value: '5000' },
    });
    expect(within(dialog).getByText(MAX_ITERATIONS_INVALID)).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Save Settings' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('stays open and says so when the save fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(apiListDocuments).mockResolvedValue([]);
    vi.mocked(apiSaveWorkbookSettings).mockRejectedValue(new Error('offline'));
    const { dialog, onClose, pushUndo } = open();
    save(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      SETTINGS_NOT_SAVED,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', () => {
    vi.mocked(apiListDocuments).mockResolvedValue([]);
    const { dialog, onClose } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(apiSaveWorkbookSettings).not.toHaveBeenCalled();
  });
});
