// @vitest-environment jsdom

// docs/specs/029-sheets/files-and-print.md "The import report" (D120): shown once on the spreadsheet a file made,
// titled by it, its lines as a list, closed with OK; nothing when no report waits.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { keepImportReport } from '@/lib/spreadsheet/import-report-handoff';
import { ImportReportDialog } from './ImportReportDialog';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('ImportReportDialog', () => {
  it('is nothing on the static page, which holds no report', () => {
    keepImportReport('doc-1', { name: 'Budget', lines: ['x'] });
    expect(renderToString(<ImportReportDialog documentId="doc-1" />)).toBe('');
  });

  it('is nothing when no report waits for the spreadsheet', () => {
    keepImportReport('other', { name: 'Other', lines: ['x'] });
    const { container } = render(<ImportReportDialog documentId="doc-1" />);
    expect(container.innerHTML).toBe('');
  });

  it('lists what the file left behind once, and closes with OK', () => {
    const lines = [
      '1 chart sheet is left out: Chart1',
      '3 things the file holds could not be kept',
    ];
    keepImportReport('doc-1', { name: 'Budget', lines });
    render(<ImportReportDialog documentId="doc-1" />);
    const dialog = screen.getByRole('dialog', { name: 'Opened “Budget”' });
    expect(dialog.textContent).toContain('Some of what the file holds is not in the spreadsheet:');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(lines);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    const { container } = render(<ImportReportDialog documentId="doc-1" />);
    expect(container.innerHTML).toBe('');
  });
});
