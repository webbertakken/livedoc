// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "Table properties": Rows, Columns, Alignment, Colour and Cell; each field what
// the cells share, blank where they differ; a list applies at once, a length on Enter or when left, an invalid one says
// so; Left indent dimmed unless the table is on the left; outside a table, where to put the cursor.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TableProperties } from '@/lib/text-document/text-document-table-properties';
import { TextDocumentTablePropertiesPanel } from './TextDocumentTablePropertiesPanel';

const SHOWN: TableProperties = {
  rowHeight: 0,
  rowBreaks: true,
  headerRows: 0,
  mostHeaderRows: 2,
  columnWidth: 144,
  verticalAlign: 'top',
  align: 'start',
  indent: 0,
  borderColor: '#000000',
  borderWidth: 1,
  background: '',
  padding: 5,
};

const panel = (properties: TableProperties | null = SHOWN) => {
  const onChange = vi.fn();
  render(
    <TextDocumentTablePropertiesPanel properties={properties} unit="in" onChange={onChange} />,
  );
  return onChange;
};

const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });
const list = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name });

describe('TextDocumentTablePropertiesPanel', () => {
  it('shows its sections and the values in the person\u2019s unit', () => {
    panel();
    expect([...document.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'Rows▾',
      'Columns▾',
      'Alignment▾',
      'Colour▾',
      'Cell▾',
    ]);
    expect(field('Column width').value).toBe('2');
    expect(field('Cell padding').value).toBe('0.07');
    expect(list('Table alignment').value).toBe('start');
    expect(list('Border width').value).toBe('1');
  });

  it('applies a length on Enter or when left, never while typed', () => {
    const onChange = panel();
    fireEvent.change(field('Column width'), { target: { value: '1.5' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(field('Column width'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ field: 'columnWidth', value: 108 });
    fireEvent.change(field('Minimum row height'), { target: { value: '0.5' } });
    fireEvent.blur(field('Minimum row height'));
    expect(onChange).toHaveBeenLastCalledWith({ field: 'rowHeight', value: 36 });
  });

  it('says what is wrong with an invalid length and applies nothing', () => {
    const onChange = panel();
    fireEvent.change(field('Cell padding'), { target: { value: '99' } });
    fireEvent.keyDown(field('Cell padding'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(field('Cell padding').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a number from 0 to 22.')).toBeTruthy();
  });

  it('applies a list choice at once, and dims Left indent unless the table is on the left', () => {
    const onChange = panel({ ...SHOWN, align: 'center' });
    expect(field('Left indent').disabled).toBe(true);
    fireEvent.change(list('Cell vertical alignment'), { target: { value: 'middle' } });
    expect(onChange).toHaveBeenCalledWith({ field: 'verticalAlign', value: 'middle' });
    fireEvent.change(list('Border width'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ field: 'borderWidth', value: 0 });
    fireEvent.change(list('Table alignment'), { target: { value: 'start' } });
    expect(onChange).toHaveBeenLastCalledWith({ field: 'align', value: 'start' });
  });

  it('leaves a field blank where the cells differ', () => {
    panel({ ...SHOWN, columnWidth: null, verticalAlign: null, borderWidth: null });
    expect(field('Column width').value).toBe('');
    expect(list('Cell vertical alignment').value).toBe('');
    expect(list('Border width').value).toBe('');
  });

  it('pins header rows from None up to the most the table may pin', () => {
    const onChange = panel({ ...SHOWN, headerRows: 1 });
    expect(list('Pin header rows').value).toBe('1');
    expect([...list('Pin header rows').options].map((o) => o.text)).toEqual(['None', '1', '2']);
    fireEvent.change(list('Pin header rows'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith({ field: 'headerRows', value: 0 });
  });

  it('lets the rows overflow across pages or not, mixed where they differ', () => {
    const onChange = panel({ ...SHOWN, rowBreaks: true });
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Allow row to overflow across pages',
    });
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith({ field: 'rowBreaks', value: false });
  });

  it('shows a mixed overflow as neither checked nor unchecked', () => {
    const onChange = panel({ ...SHOWN, rowBreaks: null });
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Allow row to overflow across pages',
    });
    expect(box.indeterminate).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith({ field: 'rowBreaks', value: true });
  });

  it('says where to put the cursor outside a table', () => {
    panel(null);
    expect(screen.getByText('Put the cursor in a table to see its properties.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
