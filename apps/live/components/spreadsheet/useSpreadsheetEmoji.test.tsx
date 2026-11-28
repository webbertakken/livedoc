// @vitest-environment jsdom
// Insert › Emoji in a spreadsheet (docs/specs/029-sheets/inserted-objects.md "Tick boxes, dropdowns and emoji", D635):
// each emoji picked goes into the open edit at its caret, or opens the active cell's edit with it after its text; the
// picker stays open; closing it gives the edit its keys back at the caret, or the grid when none is open; saved as
// typing is; an Editor's alone.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetCellEditor } from '@/components/sheets/SheetCellEditor';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetController } from '@/components/sheets/sheet-controller';
import type { FormulaInput } from '@/components/sheets/useFormulaInput';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { INSERT_EMOJI, useSpreadsheetEmoji } from './useSpreadsheetEmoji';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

// The picker, as a stand-in handing back an emoji per press.
vi.mock('@/components/office/OfficeEmojiDialog', () => ({
  OfficeEmojiDialog: (props: { onPick: (e: string) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Emoji">
      <button type="button" onClick={() => props.onPick('🎉')}>
        party
      </button>
      <button type="button" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

beforeAll(stubResizeObserver);
beforeEach(() => vi.mocked(track).mockClear());
afterEach(cleanup);

async function setup(opts: { canEdit?: boolean; cells?: Record<string, string> } = {}) {
  const h: SheetHarness = await makeSheet({ rows: 6, cols: 4, cells: opts.cells ?? {} });
  let actions: OfficeActions = {};
  let input: FormulaInput | null = null;
  let ctl: SheetController | null = null;
  renderSheet(
    h,
    (p) => {
      const emoji = useSpreadsheetEmoji(p.c, p.input);
      actions = emoji.actions;
      input = p.input;
      ctl = p.c;
      return (
        <>
          <SheetCellEditor input={p.input} />
          {emoji.dialog}
        </>
      );
    },
    { canEdit: opts.canEdit ?? true },
  );
  return { h, actions: () => actions, input: () => input!, c: () => ctl! };
}

const party = () => fireEvent.click(screen.getByRole('button', { name: 'party' }));
const editor = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: /^Edit cell/ });

describe('Insert › Emoji', () => {
  it('opens the active cell’s edit with its text and the emoji after it, the picker staying open', async () => {
    const { h, actions, c } = await setup({ cells: { B2: 'Done' } });
    act(() => h.select('B2'));
    act(() => actions()[INSERT_EMOJI]!.run());
    party();
    expect(c().editing).toMatchObject({ r: 1, c: 1, draft: 'Done🎉' });
    party();
    expect(c().editing?.draft).toBe('Done🎉🎉');
    expect(screen.getByRole('dialog', { name: 'Emoji' })).toBeTruthy();
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'Emoji');
    expect(h.cell('B2')?.input).toEqual({ s: 'Done' });
  });

  it('goes in at the open edit’s caret, which takes the keys back on close', async () => {
    const { h, actions, input, c } = await setup();
    act(() => h.select('A1'));
    act(() => c().setEditing({ r: 0, c: 0, draft: 'ab', origin: 'cell' }));
    act(() => input().setCaret(1));
    act(() => actions()[INSERT_EMOJI]!.run());
    party();
    expect(c().editing?.draft).toBe('a🎉b');
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog', { name: 'Emoji' })).toBeNull();
    expect(document.activeElement).toBe(editor());
    expect(editor().selectionStart).toBe(3);
  });

  it('gives the grid the keys on close when no edit is open', async () => {
    const { actions, c } = await setup();
    const focusGrid = vi.spyOn(c(), 'focusGrid');
    act(() => actions()[INSERT_EMOJI]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(focusGrid).toHaveBeenCalled();
  });

  it('is an Editor’s alone', async () => {
    const { actions } = await setup({ canEdit: false });
    expect(actions()).toEqual({});
  });
});
