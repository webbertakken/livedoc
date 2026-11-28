// @vitest-environment jsdom

// docs/specs/004-interface-design/office-shell.md "Dialogs" (Details) and
// docs/specs/034-text-documents/files-and-print.md "Details": a label and its value a row, in the order given, read
// only, with no button row; the × closes it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeDetailsDialog } from './OfficeDetailsDialog';

afterEach(cleanup);

describe('OfficeDetailsDialog', () => {
  it('lists each row as a label and its value, in order', () => {
    render(
      <OfficeDetailsDialog
        rows={[
          { label: 'Owner', value: 'You' },
          { label: 'Words', value: '1,204' },
        ]}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect([...dialog.querySelectorAll('th')].map((th) => th.textContent)).toEqual([
      'Owner',
      'Words',
    ]);
    expect([...dialog.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'You',
      '1,204',
    ]);
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
  });

  it('closes with its ×', () => {
    const onClose = vi.fn<() => void>();
    render(<OfficeDetailsDialog rows={[]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
