// @vitest-environment jsdom

// docs/specs/034-text-documents/files-and-print.md "Import report": a title, sections of lines with their headings
// and leads, the sentence for nothing, OK closing.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeReportDialog } from './OfficeReportDialog';

afterEach(cleanup);

describe('OfficeReportDialog', () => {
  it('lists each section with lines under its heading and lead, and closes with OK', () => {
    const onClose = vi.fn();
    render(
      <OfficeReportDialog
        title="Security limitations"
        sections={[
          { heading: 'Opened from a .html file', lead: 'Lead', lines: ['a', 'b'] },
          { heading: 'Converted to Word', lines: [] },
          { heading: 'Converted to OpenDocument', lines: ['c'] },
        ]}
        empty="Nothing"
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Security limitations' });
    expect([...dialog.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      'Opened from a .html file',
      'Converted to OpenDocument',
    ]);
    expect(dialog.textContent).toContain('Lead');
    expect(dialog.textContent).not.toContain('Nothing');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'a',
      'b',
      'c',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says the sentence for nothing when no section has a line', () => {
    render(
      <OfficeReportDialog
        title="Security limitations"
        sections={[{ heading: 'x', lines: [] }]}
        empty="Nothing was left out."
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toContain('Nothing was left out.');
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
