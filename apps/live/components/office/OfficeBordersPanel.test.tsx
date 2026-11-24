// @vitest-environment jsdom
// docs/specs/029-sheets/formatting.md "Borders" (D209): the toolbar's Borders panel.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OfficeBordersPanel, type OfficeBorders } from './OfficeBordersPanel';

function setup(over: Partial<OfficeBorders> = {}) {
  const borders: OfficeBorders = {
    apply: vi.fn(),
    colour: '#000000',
    setColour: vi.fn(),
    line: 'thin',
    setLine: vi.fn(),
    ...over,
  };
  const onClose = vi.fn();
  render(
    <>
      <button type="button" data-office-control="borders">
        Borders
      </button>
      <button type="button">Elsewhere</button>
      <OfficeBordersPanel borders={borders} controlId="borders" onClose={onClose} />
    </>,
  );
  return { borders, onClose, panel: screen.getByRole('dialog', { name: 'Borders' }) };
}

describe('OfficeBordersPanel', () => {
  it('lists the ten placements in Google’s order, the first focused', () => {
    const { panel } = setup();
    const placements = within(panel)
      .getByRole('group', { name: 'Placements' })
      .querySelectorAll('button');
    expect([...placements].map((b) => b.getAttribute('aria-label'))).toEqual([
      'All Borders',
      'Inner Borders',
      'Horizontal Borders',
      'Vertical Borders',
      'Outer Borders',
      'Left Border',
      'Top Border',
      'Right Border',
      'Bottom Border',
      'Clear Borders',
    ]);
    expect(document.activeElement).toBe(placements[0]);
    // Two rows of five, as Google lays them out.
    expect(within(panel).getByRole('group', { name: 'Placements' }).style.gridTemplateColumns).toBe(
      'repeat(5, minmax(2.5rem, 1fr))',
    );
  });

  it('closes and draws a placement', () => {
    const { borders, onClose, panel } = setup();
    fireEvent.click(within(panel).getByRole('button', { name: 'Horizontal Borders' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(borders.apply).toHaveBeenCalledWith('horizontal');
  });

  it('keeps a colour picked in the one picker, the tool closing after', () => {
    const { borders, panel } = setup({ colour: '#ff0000' });
    const tool = within(panel).getByRole('button', { name: 'Border Colour' });
    expect(tool.querySelector<HTMLElement>('[data-colour-bar]')!.dataset.colourBar).toBe('#ff0000');
    fireEvent.click(tool);
    expect(tool.getAttribute('aria-expanded')).toBe('true');
    const picker = within(panel).getByRole('group', { name: 'Border Colour' });
    fireEvent.click(within(picker).getAllByRole('button', { name: 'Blue' })[1]!);
    expect(borders.setColour).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
    expect(within(panel).queryByRole('group', { name: 'Border Colour' })).toBeNull();
    fireEvent.click(tool);
    fireEvent.click(tool);
    expect(tool.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a line picked from the six, the one in use checked', () => {
    const { borders, panel } = setup({ line: 'dashed' });
    const tool = within(panel).getByRole('button', { name: 'Border Style' });
    fireEvent.click(tool);
    const lines = within(panel).getByRole('radiogroup', { name: 'Border Style' });
    expect(
      within(lines)
        .getAllByRole('radio')
        .map((r) => [r.getAttribute('aria-label'), r.getAttribute('aria-checked')]),
    ).toEqual([
      ['Thin', 'false'],
      ['Medium', 'false'],
      ['Thick', 'false'],
      ['Dashed', 'true'],
      ['Dotted', 'false'],
      ['Double', 'false'],
    ]);
    fireEvent.click(within(lines).getByRole('radio', { name: 'Double' }));
    expect(borders.setLine).toHaveBeenCalledWith('double');
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    fireEvent.click(tool);
    fireEvent.click(tool);
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
  });

  it('closes on Escape and a press outside, never on a press on its own control', () => {
    const { onClose } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Borders' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
