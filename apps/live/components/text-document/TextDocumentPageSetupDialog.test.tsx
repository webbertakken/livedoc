// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup": the Pages tab's orientation, paper size, page colour
// and margins, refused margins, a file's custom size, Set as default and OK.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PageSetup, type PageSetup as Setup } from '@livedoc/text-documents';
import {
  NO_ROOM_FOR_TEXT,
  SAVED_AS_DEFAULT,
  TextDocumentPageSetupDialog,
} from './TextDocumentPageSetupDialog';

vi.mock('@/hooks/ui/useDocumentColours', () => ({ useDocumentColours: () => [] }));

function open(setup: Setup, unit: 'cm' | 'in' = 'in') {
  const onApply = vi.fn();
  const onSaveDefault = vi.fn();
  const onClose = vi.fn();
  render(
    <TextDocumentPageSetupDialog
      open
      setup={setup}
      unit={unit}
      onApply={onApply}
      onSaveDefault={onSaveDefault}
      onClose={onClose}
    />,
  );
  const margin = (side: string) =>
    screen.getByRole<HTMLInputElement>('textbox', { name: `${side} margin (${unit})` });
  const paper = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Paper size' });
  const ok = screen.getByRole<HTMLButtonElement>('button', { name: 'OK' });
  return { onApply, onSaveDefault, onClose, margin, paper, ok };
}

describe('TextDocumentPageSetupDialog', () => {
  it('shows the page there is: portrait, its paper, its margins in the unit', () => {
    const { margin, paper } = open(PageSetup.of('a4'), 'cm');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Portrait' }).checked).toBe(true);
    expect(paper.value).toBe('a4');
    expect(paper.selectedOptions[0]!.textContent).toBe('A4 (21 × 29.7 cm)');
    expect(margin('Top').value).toBe('2.54');
    expect(screen.getByText('Margins (centimetres)')).toBeTruthy();
  });

  it('lists Google paper sizes in order, with their sides', () => {
    const { paper } = open(PageSetup.of('letter'));
    expect([...paper.options].map((o) => o.textContent)).toEqual([
      'Letter (8.5 × 11 in)',
      'Tabloid (11 × 17 in)',
      'Legal (8.5 × 14 in)',
      'Statement (5.5 × 8.5 in)',
      'Executive (7.25 × 10.5 in)',
      'Folio (8.5 × 13 in)',
      'A3 (11.69 × 16.54 in)',
      'A4 (8.27 × 11.69 in)',
      'A5 (5.83 × 8.27 in)',
      'B4 (9.84 × 13.9 in)',
      'B5 (6.93 × 9.84 in)',
    ]);
  });

  it('applies a paper, landscape, margins typed and a colour as one setup', () => {
    const { margin, paper, ok, onApply } = open(PageSetup.of('letter'));
    fireEvent.change(paper, { target: { value: 'a5' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Landscape' }));
    fireEvent.change(margin('Left'), { target: { value: '0.5' } });
    fireEvent.click(ok);
    const a5 = PageSetup.withPaper(PageSetup.of('letter'), 'a5');
    expect(onApply).toHaveBeenCalledWith({
      ...PageSetup.oriented(a5, 'landscape'),
      margins: { top: 72, bottom: 72, left: 36, right: 72 },
    });
  });

  it('keeps a margin left as shown at its exact length', () => {
    const setup = {
      ...PageSetup.of('a4'),
      margins: { top: 70.866, bottom: 70.866, left: 70.866, right: 70.866 },
    };
    const { ok, onApply } = open(setup, 'cm');
    fireEvent.click(ok);
    expect(onApply).toHaveBeenCalledWith(setup);
  });

  it('refuses margins that leave too little room for text, holding OK and Set as default', () => {
    const { margin, ok } = open(PageSetup.of('letter'));
    fireEvent.change(margin('Left'), { target: { value: '4' } });
    fireEvent.change(margin('Right'), { target: { value: '3.6' } });
    expect(margin('Left').getAttribute('aria-invalid')).toBe('true');
    expect(margin('Right').getAttribute('aria-invalid')).toBe('true');
    expect(margin('Top').getAttribute('aria-invalid')).toBe('false');
    expect(screen.getAllByText(NO_ROOM_FOR_TEXT)).toHaveLength(2);
    expect(ok.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Set as default' }).disabled).toBe(
      true,
    );
  });

  it('refuses a margin past the field range', () => {
    const { margin, ok } = open(PageSetup.of('letter'));
    fireEvent.change(margin('Top'), { target: { value: '23' } });
    expect(screen.getByText('Enter a number from 0 to 22.')).toBeTruthy();
    expect(ok.disabled).toBe(true);
  });

  it('offers a size a file brought as Custom, first, kept until another paper is picked', () => {
    const custom = { ...PageSetup.of('letter'), width: 400, height: 600 };
    const { paper, ok, onApply } = open(custom);
    expect(paper.value).toBe('custom');
    expect(paper.options[0]!.textContent).toBe('Custom (5.56 × 8.33 in)');
    fireEvent.click(screen.getByRole('radio', { name: 'Landscape' }));
    fireEvent.click(ok);
    expect(onApply).toHaveBeenCalledWith({
      ...custom,
      width: 600,
      height: 400,
      orientation: 'landscape',
    });
  });

  it('keeps the page colour, and white as none', () => {
    const { ok, onApply } = open({ ...PageSetup.of('letter'), pageColor: '#fff2cc' });
    fireEvent.click(ok);
    expect(onApply).toHaveBeenCalledWith({ ...PageSetup.of('letter'), pageColor: '#fff2cc' });
  });

  it('sets as default without closing, the button and a status saying so until a field changes', () => {
    const { margin, onSaveDefault, onApply, onClose } = open(PageSetup.of('letter'));
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    expect(onSaveDefault).toHaveBeenCalledWith(PageSetup.of('letter'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: SAVED_AS_DEFAULT })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Saved as your default page setup.');
    fireEvent.change(margin('Top'), { target: { value: '0.5' } });
    expect(screen.getByRole('button', { name: 'Set as default' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
