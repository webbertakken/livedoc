// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": the options panel's three looks as a choice,
// each with its picture, and Levels from 1 to 6; a change applies at once; with none selected it says so.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextDocumentContentsPanel } from './TextDocumentContentsPanel';

describe('TextDocumentContentsPanel', () => {
  it('says to select one when none is selected', () => {
    render(<TextDocumentContentsPanel selected={null} onChange={vi.fn()} />);
    expect(screen.getByText('Select a table of contents to change its options.')).toBeTruthy();
  });

  it('shows the look and levels, and changes them at once', () => {
    const onChange = vi.fn();
    render(
      <TextDocumentContentsPanel selected={{ look: 'dotted', levels: 3 }} onChange={onChange} />,
    );
    const looks = screen.getByRole('radiogroup', { name: 'Look' });
    expect(looks.querySelectorAll('svg')).toHaveLength(3);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dotted' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'With blue links' }));
    expect(onChange).toHaveBeenLastCalledWith({ look: 'links' });
    const levels = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Levels' });
    expect(levels.value).toBe('3');
    expect([...levels.options].map((o) => o.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    fireEvent.change(levels, { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ levels: 1 });
  });
});
