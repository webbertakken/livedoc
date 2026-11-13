// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipButtons } from './FlipButtons';

afterEach(cleanup);

// docs/specs/008-canvas/selection-transforms.md "Where flips live".
describe('FlipButtons', () => {
  it('flips horizontally and vertically', () => {
    const onFlip = vi.fn();
    render(<FlipButtons onFlip={onFlip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Flip Horizontal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flip Vertical' }));
    expect(onFlip.mock.calls).toEqual([['horizontal'], ['vertical']]);
  });

  it('are actions, not toggles', () => {
    render(<FlipButtons onFlip={() => {}} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('aria-pressed')).toBe(false);
    }
  });
});
