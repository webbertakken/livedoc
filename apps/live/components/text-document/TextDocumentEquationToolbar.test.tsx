// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Equations in the editor": the equation toolbar holds New equation and the
// five menus in Google's order; a menu is a grid of its symbols by name, Math operators' drawn as their structures; a
// press picks one and closes the menu; Escape closes it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EQUATION_MENU_CELLS, TextDocumentEquationToolbar } from './TextDocumentEquationToolbar';

afterEach(cleanup);

describe('TextDocumentEquationToolbar', () => {
  it('holds New equation and the five menus in order', () => {
    render(<TextDocumentEquationToolbar onNew={() => {}} onPick={() => {}} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Equation toolbar' });
    expect([...toolbar.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'New equation',
      'Greek letters',
      'Miscellaneous operations',
      'Relations',
      'Math operators',
      'Arrows',
    ]);
  });

  it('runs New equation', () => {
    const onNew = vi.fn();
    render(<TextDocumentEquationToolbar onNew={onNew} onPick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New equation' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('opens a menu’s grid, picks a symbol by its name and closes', () => {
    const onPick = vi.fn();
    render(<TextDocumentEquationToolbar onNew={() => {}} onPick={onPick} />);
    const greek = screen.getByRole('button', { name: 'Greek letters' });
    fireEvent.click(greek);
    expect(greek.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }));
    expect(onPick).toHaveBeenCalledWith({ kind: 'identifier', text: 'α' });
    expect(screen.queryByRole('group', { name: 'Greek letters' })).toBeNull();
  });

  it('draws Math operators as their structures, and closes on Escape', () => {
    render(<TextDocumentEquationToolbar onNew={() => {}} onPick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Math operators' }));
    const grid = screen.getByRole('group', { name: 'Math operators' });
    expect(grid.querySelectorAll('button')).toHaveLength(EQUATION_MENU_CELLS.operators.length);
    expect(screen.getByRole('button', { name: 'frac' }).querySelector('mfrac')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Math operators' })).toBeNull();
  });
});
