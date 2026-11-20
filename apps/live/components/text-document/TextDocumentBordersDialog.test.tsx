// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Borders and shading": the dialog.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BorderSide } from '@livedoc/text-documents';
import type { BordersAndShading } from '@/lib/text-document/text-document-borders';
import { NO_BETWEEN_IN_ODF, TextDocumentBordersDialog } from './TextDocumentBordersDialog';

const PLAIN: BordersAndShading = {
  width: 0,
  dash: null,
  color: null,
  padding: null,
  shading: 'none',
};

function setup({ odf = false, read = (_: readonly BorderSide[]) => PLAIN } = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const reader = vi.fn(read);
  render(
    <TextDocumentBordersDialog open read={reader} odf={odf} onApply={onApply} onClose={onClose} />,
  );
  const position = (name: string) => screen.getByRole('button', { name });
  const select = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name });
  return { onApply, onClose, reader, position, select };
}

describe('TextDocumentBordersDialog', () => {
  it('opens with every position pressed and the shared values shown', () => {
    const { position, select, reader } = setup();
    for (const name of ['Top', 'Bottom', 'Left', 'Right', 'Between'])
      expect(position(name).getAttribute('aria-pressed')).toBe('true');
    expect(reader).toHaveBeenCalledWith(['top', 'bottom', 'left', 'right', 'between']);
    expect(select('Border width').value).toBe('0');
    expect(select('Border dash').value).toBe('');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Paragraph padding' }).value).toBe(
      '',
    );
  });

  it('applies the pressed positions with what was chosen, blank fields left as they are', () => {
    const { position, select, onApply } = setup();
    fireEvent.click(position('Left'));
    fireEvent.click(position('Right'));
    fireEvent.click(position('Between'));
    fireEvent.change(select('Border width'), { target: { value: '2' } });
    fireEvent.change(select('Border dash'), { target: { value: 'dotted' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Paragraph padding' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({
      sides: ['top', 'bottom'],
      width: 2,
      dash: 'dotted',
      color: null,
      padding: 4,
      shading: 'none',
    });
  });

  it('reads the pressed positions again as they change, showing Mixed where they differ', () => {
    const { position, select } = setup({
      read: (sides) =>
        sides.length === 1 ? { ...PLAIN, width: 3, dash: 'dashed' } : { ...PLAIN, width: null },
    });
    expect(select('Border width').value).toBe('');
    expect(screen.getAllByRole('option', { name: 'Mixed' })).toHaveLength(2);
    for (const name of ['Bottom', 'Left', 'Right', 'Between']) fireEvent.click(position(name));
    expect(select('Border width').value).toBe('3');
    expect(select('Border dash').value).toBe('dashed');
  });

  it('resets to no borders, no background and no padding, applying only on Apply', () => {
    const { onApply } = setup({
      read: () => ({ width: 1, dash: 'solid', color: '#000000', padding: 4, shading: '#fff2cc' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ width: 0, padding: 0, shading: 'none' }),
    );
  });

  it('refuses padding out of range, and Apply with it', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Paragraph padding' }), {
      target: { value: '80' },
    });
    expect(screen.getByText('Enter a number from 0 to 72.')).toBeTruthy();
    const apply = screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' });
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('dims Between in an OpenDocument text document, saying why, and leaves it out', () => {
    const { position, onApply } = setup({ odf: true });
    const between = position('Between');
    expect(between.getAttribute('aria-disabled')).toBe('true');
    expect(between.getAttribute('aria-pressed')).toBe('false');
    expect(between.title).toBe(NO_BETWEEN_IN_ODF);
    fireEvent.click(between);
    expect(between.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ sides: ['top', 'bottom', 'left', 'right'] }),
    );
  });

  it('changes nothing on Cancel', () => {
    const { onApply, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
