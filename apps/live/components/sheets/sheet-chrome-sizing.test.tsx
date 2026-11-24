// @vitest-environment jsdom
// docs/specs/004-interface-design/sizing.md: a sheet's own chrome (find bar, formula bar, status bar) is on the
// sizing scale; its cells are content and keep their own sizes.
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSheet, renderSheet, stubResizeObserver } from './sheet-ui-test-utils';
import { SheetFindBar } from './SheetFindBar';
import { SheetFormulaBar } from './SheetFormulaBar';
import { SheetStatusBar } from './SheetStatusBar';
import { resetStatusPick } from './sheet-status-pick';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);
afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

describe('a sheet’s chrome on the sizing scale', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStatusPick();
  });

  it('draws the find bar’s field and buttons at the field step, reading at 14 px', async () => {
    const h = await makeSheet({ cells: { A1: 'apple' } });
    renderSheet(h, ({ c }) => (c.findOpen ? <SheetFindBar /> : null));
    act(() => h.ctl().setFindOpen('replace'));

    const bar = screen.getByRole('search', { name: 'Find in sheet' });
    expect(bar.className).toContain('text-body');
    expect(screen.getByLabelText('Find').className).toContain('h-field');
    expect(screen.getByRole('button', { name: 'Next Match' }).className).toContain('size-field');
    // Replace All sits level with Replace and the fields: every control in the bar is 32 px.
    expect(screen.getByRole('button', { name: 'Replace All' }).className).toContain('min-h-field');
    expect(bar.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('keeps the formula bar a 28 px bar with a 24 px name box at 12 px', async () => {
    const h = await makeSheet({ cells: { A1: '1' } });
    renderSheet(h, ({ actions, input }) => <SheetFormulaBar actions={actions} input={input} />);

    const name = screen.getByLabelText('Name box').className;
    expect(name).toContain('h-chip');
    expect(name).toContain('text-supporting');
  });

  it('totals a selection on a 24 px control at 12 px, with no semibold figures', async () => {
    const h = await makeSheet({ cells: { A1: '2', A2: '4' } });
    renderSheet(h, () => <SheetStatusBar />, {});
    act(() => h.select('A1:A2'));

    const totals = screen.getByRole('button', { name: 'Selection totals' });
    expect(totals.className).toContain('h-chip');
    expect(totals.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
