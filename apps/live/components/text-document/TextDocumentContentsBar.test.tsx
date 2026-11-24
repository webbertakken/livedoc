// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": the selected block's bar, a toolbar named
// Table of contents holding Update table of contents and Table of contents options; arrows move along it; Escape goes
// back to the writing.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextDocumentContentsBar } from './TextDocumentContentsBar';

describe('TextDocumentContentsBar', () => {
  it('updates, opens the options and goes back', () => {
    const handlers = { onUpdate: vi.fn(), onOptions: vi.fn(), onBack: vi.fn() };
    render(<TextDocumentContentsBar {...handlers} />);
    const bar = screen.getByRole('toolbar', { name: 'Table of contents' });
    const update = screen.getByRole('button', { name: 'Update table of contents' });
    const options = screen.getByRole('button', { name: 'Table of contents options' });
    fireEvent.click(update);
    expect(handlers.onUpdate).toHaveBeenCalledOnce();
    fireEvent.click(options);
    expect(handlers.onOptions).toHaveBeenCalledOnce();
    update.focus();
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(options);
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(update);
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(handlers.onBack).toHaveBeenCalledOnce();
  });
});
