// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup": Format > Page orientation.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextDocumentPageOrientationDialog } from './TextDocumentPageOrientationDialog';

describe('TextDocumentPageOrientationDialog', () => {
  it('shows the orientation there is and applies the one chosen on OK', () => {
    const onApply = vi.fn();
    render(
      <TextDocumentPageOrientationDialog
        open
        orientation="portrait"
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Portrait' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Landscape' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onApply).toHaveBeenCalledWith('landscape');
  });
});
