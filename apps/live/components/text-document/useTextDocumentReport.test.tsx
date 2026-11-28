// @vitest-environment jsdom

// docs/specs/034-text-documents/files-and-print.md "Import report": shown once to the person who opened the file, as
// the document loads; nothing for a file that dropped nothing; reopened from File > Security limitations.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import { importRecordOf, TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { keepImportReport, waitingImportReport } from '@/lib/office/import-report-handoff';
import { track } from '@/lib/telemetry';
import { SECURITY_LIMITATIONS_ITEM, useTextDocumentReport } from './useTextDocumentReport';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

const withScript = (): Y.Doc => {
  const report = {
    dropped: [{ reason: 'active-content' as const, name: 'script', count: 1 }],
    kept: [],
  };
  return TextDocumentState.load([
    TextDocumentState.fromDocument(TextDocument.blank(), importRecordOf('html', report)),
  ]);
};

function Host({ doc }: { doc: Y.Doc | null }) {
  const { actions, dialog } = useTextDocumentReport({ doc, documentId: 'doc-1', name: 'Page' });
  return (
    <>
      <button type="button" onClick={() => actions[SECURITY_LIMITATIONS_ITEM]!.run()}>
        Reopen
      </button>
      {dialog}
    </>
  );
}

describe('useTextDocumentReport', () => {
  it('shows the report once to the person who opened the file, once the writing has loaded', () => {
    keepImportReport('doc-1', { name: 'Page', lines: [] });
    const doc = withScript();
    const { rerender } = render(<Host doc={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Host doc={doc} />);
    const dialog = screen.getByRole('dialog', { name: 'Opened “Page”' });
    expect(dialog.textContent).toContain('1 script, frame or control left out, never run: script');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(waitingImportReport('doc-1')).toBeNull();
  });

  it('shows nothing to anyone else, and nothing for a file that dropped nothing', () => {
    render(<Host doc={withScript()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    keepImportReport('doc-1', { name: 'Page', lines: [] });
    render(<Host doc={TextDocumentState.load()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(waitingImportReport('doc-1')).toBeNull();
  });

  it('reopens from Security limitations for anyone, with the sentence for nothing', () => {
    render(<Host doc={TextDocumentState.load()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    const dialog = screen.getByRole('dialog', { name: 'Security limitations' });
    expect(dialog.textContent).toContain('Nothing was left out or kept aside');
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentSecurityLimitations');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reopens nothing before the writing has loaded', () => {
    render(<Host doc={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
