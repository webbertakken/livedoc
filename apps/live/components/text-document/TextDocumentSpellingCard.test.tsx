// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NO_SPELLING_SUGGESTIONS,
  NO_SUGGESTIONS,
  TextDocumentSpellingCard,
} from './TextDocumentSpellingCard';

// docs/specs/034-text-documents/tools.md "Spelling and grammar": the card.

const handlers = () => ({
  onAccept: vi.fn(),
  onIgnore: vi.fn(),
  onAdd: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onClose: vi.fn(),
});

describe('TextDocumentSpellingCard', () => {
  it('offers the word’s suggestions, the first chosen, and accepts the one chosen', () => {
    const on = handlers();
    render(
      <TextDocumentSpellingCard current={{ word: 'teh', suggestions: ['the', 'tea'] }} {...on} />,
    );
    const card = screen.getByRole('dialog', { name: 'Spelling and grammar' });
    expect(card.textContent).toContain('Change teh to');
    expect(screen.getByRole('radio', { name: 'the' })).toHaveProperty('checked', true);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'the' }));
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'tea' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Accept$/ }));
    });
    expect(on.onAccept).toHaveBeenCalledWith('tea');
  });

  it('chooses the first suggestion again for the next word', () => {
    const on = handlers();
    const { rerender } = render(
      <TextDocumentSpellingCard current={{ word: 'teh', suggestions: ['the', 'tea'] }} {...on} />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'tea' }));
    });
    rerender(
      <TextDocumentSpellingCard current={{ word: 'mta', suggestions: ['mat', 'map'] }} {...on} />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Accept$/ }));
    });
    expect(on.onAccept).toHaveBeenCalledWith('mat');
  });

  it('ignores, adds, steps and closes', () => {
    const on = handlers();
    render(<TextDocumentSpellingCard current={{ word: 'teh', suggestions: ['the'] }} {...on} />);
    for (const [name, handler] of [
      [/^Ignore$/, on.onIgnore],
      [/^Add to personal dictionary$/, on.onAdd],
      [/^Next$/, on.onNext],
      [/^Previous$/, on.onPrevious],
      [/^Close$/, on.onClose],
    ] as const) {
      act(() => {
        fireEvent.click(screen.getByRole('button', { name }));
      });
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('takes the keyboard again for each word, and when none is left', () => {
    const on = handlers();
    const { rerender } = render(
      <TextDocumentSpellingCard current={{ word: 'teh', suggestions: ['the'] }} {...on} />,
    );
    rerender(<TextDocumentSpellingCard current={{ word: 'mta', suggestions: ['mat'] }} {...on} />);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'mat' }));
    rerender(<TextDocumentSpellingCard current={null} {...on} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    });
    expect(on.onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const on = handlers();
    render(<TextDocumentSpellingCard current={{ word: 'teh', suggestions: [] }} {...on} />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(on.onClose).toHaveBeenCalled();
  });

  it('cannot accept a word with no suggestion', () => {
    render(<TextDocumentSpellingCard current={{ word: 'xqz', suggestions: [] }} {...handlers()} />);
    expect(screen.getByText(NO_SUGGESTIONS)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Accept$/ })).toHaveProperty('disabled', true);
  });

  it('says so when nothing is misspelt, with only Close', () => {
    render(<TextDocumentSpellingCard current={null} {...handlers()} />);
    expect(screen.getByRole('status').textContent).toBe(NO_SPELLING_SUGGESTIONS);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['Close']);
  });
});
