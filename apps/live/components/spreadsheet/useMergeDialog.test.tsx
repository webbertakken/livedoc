// @vitest-environment jsdom
// formatting.md "Merges" (D208): a merge that would clear values asks first, in the shell's Merge Cells dialog; OK
// merges, Cancel changes nothing; one with nothing to clear merges at once.
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { useMergeDialog } from './useMergeDialog';

beforeAll(stubResizeObserver);

function Host({ actions }: { actions: SheetActions }) {
  const { merge, dialog } = useMergeDialog(actions);
  return (
    <>
      <button type="button" onClick={() => merge('all')}>
        Merge All
      </button>
      {dialog}
    </>
  );
}

const merges = (h: Awaited<ReturnType<typeof makeSheet>>) =>
  h.store.sheet(SHEET_ID)!.layout.merges?.length ?? 0;

describe('useMergeDialog', () => {
  it('asks before clearing values, and OK merges keeping the top-left', async () => {
    const h = await makeSheet({ cells: { A1: 'keep', B1: 'lost' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1:B1' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge All' }));
    const dialog = screen.getByRole('dialog', { name: 'Merge Cells' });
    expect(dialog.textContent).toContain(
      'Merging cells will only preserve the top-leftmost value.',
    );
    expect(merges(h)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(merges(h)).toBe(1);
    expect(h.value('A1')).toBe('keep');
    expect(h.value('B1')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changes nothing on Cancel', async () => {
    const h = await makeSheet({ cells: { A1: 'keep', B1: 'lost' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1:B1' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(merges(h)).toBe(0);
    expect(h.value('B1')).toBe('lost');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('merges at once when nothing would be cleared', async () => {
    const h = await makeSheet({ cells: { A1: 'keep' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1:B2' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge All' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(merges(h)).toBe(1);
  });
});
