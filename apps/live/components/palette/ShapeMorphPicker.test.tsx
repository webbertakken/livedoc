// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShapeMorphPicker } from './ShapeMorphPicker';

// docs/specs/008-canvas/canvas-and-palette.md "Shape": the common kinds, the mind node among them, and a search.

afterEach(() => cleanup());

const setup = () => {
  const onPick = vi.fn();
  render(
    <ShapeMorphPicker
      current="square"
      onPick={onPick}
      onPreview={vi.fn()}
      onPreviewEnd={vi.fn()}
    />,
  );
  const search = screen.getByRole('searchbox', { name: 'Search shapes' });
  return { onPick, search };
};

describe('ShapeMorphPicker', () => {
  it('offers the mind node beside the common kinds', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mind Node' }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith('mind-node');
  });

  it('finds a kind by its words and picks it with a click or Enter', () => {
    const { onPick, search } = setup();
    fireEvent.change(search, { target: { value: 'cloud' } });
    const list = screen.getByRole('list', { name: 'Matching shapes' });
    expect(list.textContent).toContain('Cloud');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledExactlyOnceWith('cloud');
  });

  it('says when nothing matches, and Escape clears the search', () => {
    const { search } = setup();
    fireEvent.change(search, { target: { value: 'zzzqqq' } });
    expect(screen.getByRole('status').textContent).toBe('No shapes match');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Square' })).toBeTruthy();
  });
});
