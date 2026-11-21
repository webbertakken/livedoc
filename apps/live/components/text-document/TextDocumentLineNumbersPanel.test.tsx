// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Line numbers" (The panel): Show line numbers, the three restarts dimmed
// while off, Apply to dimmed with one section; each choice applied at once, Apply to changing nothing by itself.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LineNumbersState } from './useTextDocumentLineNumbers';
import { TextDocumentLineNumbersPanel } from './TextDocumentLineNumbersPanel';

const panel = (own: LineNumbersState['own'], section = 0) => {
  const onChoose = vi.fn();
  render(<TextDocumentLineNumbersPanel state={{ own, section }} onChoose={onChoose} />);
  return onChoose;
};

const show = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show line numbers' });
const restart = (name: string) => screen.getByRole<HTMLInputElement>('radio', { name });
const scope = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Apply to' });

describe('TextDocumentLineNumbersPanel', () => {
  it('shows a section without numbers unchecked, its restarts dimmed at Continue, Apply to dimmed', () => {
    const onChoose = panel([undefined]);
    expect(show().checked).toBe(false);
    const restarts = screen.getAllByRole<HTMLInputElement>('radio');
    expect(restarts.map((r) => r.parentElement?.textContent)).toEqual([
      'Continue throughout the document',
      'Restart on each page',
      'Restart on each section',
    ]);
    expect(restarts.every((r) => r.matches(':disabled'))).toBe(true);
    expect(restarts[0]!.checked).toBe(true);
    expect(scope().disabled).toBe(true);
    fireEvent.click(show());
    expect(onChoose).toHaveBeenCalledWith({
      scope: 'document',
      shown: true,
      restart: 'continuous',
    });
  });

  it("shows the caret's section's restart and applies a new one over the scope chosen", () => {
    const onChoose = panel([undefined, { restart: 'page' }], 1);
    expect(show().checked).toBe(true);
    expect(restart('Restart on each page').checked).toBe(true);
    expect(scope().value).toBe('document');
    fireEvent.change(scope(), { target: { value: 'section' } });
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(restart('Restart on each section'));
    expect(onChoose).toHaveBeenCalledWith({ scope: 'section', shown: true, restart: 'section' });
    fireEvent.click(show());
    expect(onChoose).toHaveBeenLastCalledWith({ scope: 'section', shown: false, restart: 'page' });
  });
});
