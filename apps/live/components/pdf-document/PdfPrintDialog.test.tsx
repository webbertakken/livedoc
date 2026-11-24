// @vitest-environment jsdom
// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": the dialog asks Pages (all, the current page, a
// range) and Marks (document and marks, document only); a range that is none says so under its field and prints
// nothing; Enter prints.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfPrintDialog } from './PdfPrintDialog';

function dialog() {
  const onPrint = vi.fn();
  render(<PdfPrintDialog open count={10} current={4} onClose={vi.fn()} onPrint={onPrint} />);
  const print = () => fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  return { onPrint, print };
}

describe('PdfPrintDialog', () => {
  it('prints every page with the marks unless told otherwise', () => {
    const { onPrint, print } = dialog();
    expect(screen.getByRole('dialog', { name: 'Print' })).toBeTruthy();
    print();
    expect(onPrint).toHaveBeenCalledWith({ pages: null, marks: true });
  });

  it('prints the current page, the document only', () => {
    const { onPrint, print } = dialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Current page' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Document only' }));
    print();
    expect(onPrint).toHaveBeenCalledWith({ pages: [4], marks: false });
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Document and marks' }));
    print();
    expect(onPrint).toHaveBeenLastCalledWith({ pages: null, marks: true });
  });

  it('prints a range typed, choosing Pages as it is typed', () => {
    const { onPrint, print } = dialog();
    const field = screen.getByRole('textbox', { name: 'Pages to print' });
    fireEvent.focus(field);
    expect(screen.getByRole('radio', { name: 'Pages' })).toHaveProperty('checked', true);
    fireEvent.change(field, { target: { value: '8, 1-3' } });
    print();
    expect(onPrint).toHaveBeenCalledWith({ pages: [0, 1, 2, 7], marks: true });
  });

  it('says what a range looks like for one that is none, and prints nothing until it is mended', () => {
    const { onPrint, print } = dialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Pages' }));
    const field = screen.getByRole('textbox', { name: 'Pages to print' });
    fireEvent.change(field, { target: { value: '12' } });
    print();
    expect(onPrint).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Pages like 1-3, 8, from 1 to 10.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(field, { target: { value: '2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    print();
    expect(onPrint).toHaveBeenCalledWith({ pages: [1], marks: true });
  });
});
