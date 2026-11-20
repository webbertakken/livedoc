// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Spacing and keep rules": Custom spacing.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Spacing } from '@/lib/text-document/text-document-paragraph-formatting';
import { readSpacingField, TextDocumentSpacingDialog } from './TextDocumentSpacingDialog';

function setup(spacing: Spacing) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<TextDocumentSpacingDialog open spacing={spacing} onApply={onApply} onClose={onClose} />);
  const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });
  return {
    onApply,
    onClose,
    field,
    apply: screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }),
  };
}

describe('TextDocumentSpacingDialog', () => {
  it("shows the paragraphs' spacing, blank where they differ", () => {
    const { field } = setup({ lineHeight: 1.15, before: null, after: 6 });
    expect(field('Line spacing').value).toBe('1.15');
    expect(field('Before').value).toBe('');
    expect(field('After').value).toBe('6');
  });

  it('applies what is typed, a blank field left as each paragraph has it', () => {
    const { field, apply, onApply } = setup({ lineHeight: 1.15, before: null, after: 6 });
    fireEvent.change(field('Line spacing'), { target: { value: '2,5' } });
    fireEvent.change(field('After'), { target: { value: '' } });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith({ lineHeight: 2.5, before: null, after: null });
  });

  it('refuses a value out of range in its field, and Apply with it', () => {
    const { field, apply, onApply } = setup({ lineHeight: 1, before: 0, after: 0 });
    fireEvent.change(field('Line spacing'), { target: { value: '0.01' } });
    expect(screen.getByText('Enter a number from 0.06 to 100.')).toBeTruthy();
    fireEvent.change(field('Line spacing'), { target: { value: '1' } });
    fireEvent.change(field('Before'), { target: { value: '1585' } });
    expect(field('Before').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a number from 0 to 1584.')).toBeTruthy();
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('changes nothing on Cancel', () => {
    const { onApply, onClose } = setup({ lineHeight: 1, before: 0, after: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('reads a field', () => {
    expect(readSpacingField('abc', { min: 0, max: 1 })).toBe('invalid');
    expect(readSpacingField(' ', { min: 0, max: 1 })).toBeNull();
    expect(readSpacingField('1', { min: 0, max: 1 })).toBe(1);
  });
});
