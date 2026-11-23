// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FinishTab } from './FinishTab';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a section label is 12 px supporting text in its own case, a choice
// names itself at 14 px with medium only on the chosen one, and nothing is set semibold or in tracked capitals.
describe('the look dialog tabs on the sizing scale', () => {
  it('labels the Finish section in its own case and names each finish at the reading size', () => {
    render(
      <FinishTab
        finish={undefined}
        onSetFinish={() => {}}
        canvasBackground={undefined}
        themeId="default"
        font={null}
      />,
    );

    expect(screen.getByText('Finish').className).toContain('text-supporting');
    const chosen = screen.getByRole('radio', { checked: true });
    expect(chosen.innerHTML).toContain('text-body');
    expect(chosen.innerHTML).toContain('font-medium');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
