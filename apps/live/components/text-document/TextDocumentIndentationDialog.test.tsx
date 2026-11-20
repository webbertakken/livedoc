// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents": Indentation options.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Indents } from '@/lib/text-document/text-document-paragraph-formatting';
import { TextDocumentIndentationDialog } from './TextDocumentIndentationDialog';

function setup(indents: Indents, unit: 'cm' | 'in' = 'cm') {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <TextDocumentIndentationDialog
      open
      indents={indents}
      unit={unit}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const field = (name: string) => screen.getByRole('textbox', { name: `${name} (${unit})` });
  return { onApply, onClose, field, apply: screen.getByRole('button', { name: 'Apply' }) };
}

describe('TextDocumentIndentationDialog', () => {
  it("shows the paragraphs' indents in the unit, blank where they differ", () => {
    const { field } = setup({ start: 36, end: null, first: -18 });
    expect((field('Left') as HTMLInputElement).value).toBe('1.27');
    expect((field('Right') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Special indent' }).value).toBe(
      'hanging',
    );
    expect((field('Special indent size') as HTMLInputElement).value).toBe('0.64');
  });

  it('applies what is typed in points, a blank field left as each paragraph has it', () => {
    const { field, apply, onApply } = setup({ start: 0, end: null, first: 0 }, 'in');
    fireEvent.change(field('Left'), { target: { value: '1' } });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith({ start: 72, end: null, first: 0 });
  });

  it('sets a first-line indent, starting at one step when chosen', () => {
    const { field, apply, onApply } = setup({ start: 0, end: 0, first: 0 }, 'in');
    expect((field('Special indent size') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Special indent' }), {
      target: { value: 'first' },
    });
    expect((field('Special indent size') as HTMLInputElement).value).toBe('0.5');
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith({ start: 0, end: 0, first: 36 });
  });

  it('keeps mixed special indents unless one is chosen', () => {
    const { apply, onApply } = setup({ start: 0, end: 0, first: null });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Special indent' }).value).toBe(
      '',
    );
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith({ start: 0, end: 0, first: null });
  });

  it('refuses a value out of range in the field, and Apply with it', () => {
    const { field, apply, onApply } = setup({ start: 0, end: 0, first: 0 });
    fireEvent.change(field('Right'), { target: { value: '60' } });
    expect(field('Right').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a number from 0 to 55.88.')).toBeTruthy();
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('changes nothing on Cancel', () => {
    const { onApply, onClose } = setup({ start: 0, end: 0, first: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
