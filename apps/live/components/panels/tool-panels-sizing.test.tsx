// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageSlidePicker } from './PageSlidePicker';
import { ToolOptionRow } from './ToolOptionRow';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a row's title reads at 14 px in its own case, a choice is a 28 px row at
// 14 px with medium only on the chosen one, and nothing is set semibold or in tracked capitals.
describe('tool and slide panels on the sizing scale', () => {
  it('titles a tool option row in its own case and draws its choices on the row step', () => {
    render(
      <ToolOptionRow
        label="Size"
        options={[
          { id: 'small', label: 'Small' },
          { id: 'large', label: 'Large' },
        ]}
        value="small"
        open
        onToggle={() => {}}
        onPick={() => {}}
      />,
    );

    const chosen = screen.getByRole('radio', { name: 'Small' }).className;
    expect(chosen).toContain('min-h-row');
    expect(chosen).toContain('text-body');
    expect(chosen).toContain('font-medium');
    expect(screen.getByRole('radio', { name: 'Large' }).className).not.toContain('font-medium');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the page picker button as a 28 px row at the reading size', () => {
    render(<PageSlidePicker pages={[{ id: 'p1', label: 'Page 1' }]} onAdd={() => {}} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-row');
      expect(button.className).toContain('text-body');
    }
  });
});
