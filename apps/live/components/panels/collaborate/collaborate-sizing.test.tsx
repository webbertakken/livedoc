// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CollaborateEmpty } from './CollaborateEmpty';
import { KindChips, SideTabs } from './CollaborateControls';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: controls are 28 px rows at 14 px with medium only on the chosen one, a
// count is a glyph in a 16 px badge, and empty-state copy reads at 14 px over 12 px.
describe('Collaborate on the sizing scale', () => {
  it('draws the Open and Done tabs as 28 px rows, medium only on the chosen one, counts as glyph badges', () => {
    render(<SideTabs value="open" counts={{ open: 2, resolved: 5 }} onChange={() => {}} />);

    const [open, done] = screen.getAllByRole('tab');
    expect(open!.className).toContain('min-h-row');
    expect(open!.className).toContain('text-body');
    expect(open!.className).toContain('font-medium');
    expect(done!.className).not.toContain('font-medium');
    expect(open!.querySelector('.text-glyph')?.className).toContain('h-icon-row');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the kind chips on the row step at the reading size', () => {
    render(
      <KindChips value="all" counts={{ all: 3, comments: 2, actions: 1 }} onChange={() => {}} />,
    );

    for (const chip of screen.getAllByRole('button')) {
      expect(chip.className).toContain('h-row');
      expect(chip.className).toContain('text-body');
    }
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('reads an empty list at 14 px over 12 px', () => {
    render(<CollaborateEmpty side="open" kind="all" />);

    expect(document.body.innerHTML).toContain('text-body');
    expect(document.body.innerHTML).toContain('text-supporting');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
