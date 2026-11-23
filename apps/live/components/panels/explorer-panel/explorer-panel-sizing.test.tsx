// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExplorerRail } from './ExplorerRail';
import { panelSectionGroups } from './panel-sections';
import { PaneRow, PaneSection } from './pane-parts';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

function showRail(phone: boolean) {
  render(
    <ExplorerRail
      groups={panelSectionGroups({ teams: [], hasBrowserDocuments: false })}
      selected={{ kind: 'mine' }}
      onPick={() => {}}
      onNewDocument={() => {}}
      badges={{ shared: 2 }}
      teamName={() => undefined}
      divider="titles"
      phone={phone}
    />,
  );
}

// docs/specs/004-interface-design/sizing.md: rows are 28 px at the reading size, medium marks only the current one,
// group labels are 12 px supporting text in their own case, a primary action is the 36 px prominent step and a count
// is a glyph in a 16 px badge.
describe('the floating Explorer on the sizing scale', () => {
  it('draws the rail on row steps, medium only on the current section', () => {
    showRail(false);

    const current = screen.getByRole('button', { name: 'My Documents' });
    const other = screen.getByRole('button', { name: 'Timeline' });
    expect(current.className).toContain('h-row');
    expect(current.className).toContain('text-body');
    expect(current.className).toContain('font-medium');
    expect(other.className).not.toContain('font-medium');
    expect(screen.getByRole('heading', { name: 'Overview' }).className).toContain(
      'text-supporting',
    );
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws New Document as a prominent primary action and a count as a glyph badge', () => {
    showRail(false);

    expect(screen.getByRole('button', { name: /New Document/ }).className).toContain('h-prominent');
    const badge = [
      ...screen
        .getByRole('button', { name: 'Shared With Me (2)' })
        .querySelectorAll('[aria-hidden]'),
    ].find((part) => part.textContent === '2');
    expect(badge?.className).toContain('text-glyph');
    expect(badge?.className).toContain('h-icon-row');
  });

  it('keeps the phone rail on row steps with a 44 px tap area', () => {
    showRail(true);

    const chip = screen.getByRole('button', { name: 'Timeline' }).className;
    expect(chip).toContain('h-row');
    expect(chip).toContain('touch-target-y');
  });

  it('titles a pane section as supporting text and a row at the reading size', () => {
    render(
      <PaneSection title="Recent">
        <ul>
          <PaneRow leading={null} title="Roadmap" meta="Edited today" />
        </ul>
      </PaneSection>,
    );

    expect(screen.getByRole('heading', { name: 'Recent' }).className).toContain('text-supporting');
    expect(screen.getByText('Roadmap').className).toContain('text-body');
    expect(screen.getByText('Edited today').className).toContain('text-supporting');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
