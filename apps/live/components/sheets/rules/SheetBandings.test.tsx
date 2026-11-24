// @vitest-environment jsdom
// formatting.md "Alternating colours" (D216): the Alternating Colours panel's body edits the banding the selection
// touches (range, Header and Footer, default and custom styles, Remove), and offers to add one where there is none.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BANDING_STYLES } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '../sheet-ui-test-utils';
import { BANDING_OVERLAP, BANDING_RANGE, NO_BANDING, SheetBandingsBody } from './SheetBandings';

beforeAll(stubResizeObserver);
afterEach(cleanup);

const bands = (h: SheetHarness) => h.store.sheet(SHEET_ID)!.layout.bands ?? [];

async function open(at = 'A1:B4') {
  const h = await makeSheet({ rows: 12, cols: 5, cells: { A1: 'x' } });
  const onClose = vi.fn();
  let acts: Parameters<Parameters<typeof renderSheet>[1]>[0]['actions'] | null = null;
  renderSheet(
    h,
    ({ actions }) => {
      acts = actions;
      return <SheetBandingsBody actions={actions} onClose={onClose} />;
    },
    { at },
  );
  return { h, onClose, actions: () => acts! };
}

describe('the Alternating Colours panel', () => {
  it('offers to add one where there is none, in the first style with its header', async () => {
    const { h } = await open();
    expect(screen.getByText(NO_BANDING)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Alternating Colours' }));
    expect(bands(h)).toHaveLength(1);
    expect(bands(h)[0]).toMatchObject({ ...BANDING_STYLES[0]!.colours, header: true });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Apply to Range' }).value).toBe(
      'A1:B4',
    );
  });
  it('switches the header and footer, picks a default style, and removes it', async () => {
    const { h, onClose, actions } = await open();
    act(() => void actions().addBanding());
    expect(actions().addBanding()).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Footer' }));
    expect(bands(h)[0]!.footer).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Header' }));
    expect(bands(h)[0]!.header).toBeUndefined();
    const styles = screen.getByRole('group', { name: 'Default Styles' });
    fireEvent.click(within(styles).getByRole('button', { name: 'Blue' }));
    expect(bands(h)[0]).toMatchObject(BANDING_STYLES[1]!.colours);
    expect(within(styles).getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Colour 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alternating Colours' }));
    expect(bands(h)).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('picks a custom colour', async () => {
    const { h, actions } = await open();
    act(() => void actions().addBanding());
    fireEvent.click(screen.getByRole('button', { name: 'Colour 2' }));
    const picker = screen.getByRole('dialog', { name: /Colour 2/ });
    const swatch = within(picker)
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'false')!;
    fireEvent.click(swatch);
    expect(bands(h)[0]!.band2).not.toBe(BANDING_STYLES[0]!.colours.band2);
  });
  it('moves its range, refusing one off the sheet or over another', async () => {
    const { h, actions } = await open('D1:D2');
    act(() => void actions().addBanding());
    act(() => h.select('A1:B4'));
    act(() => void actions().addBanding());
    const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Apply to Range' });
    fireEvent.change(field(), { target: { value: 'nope' } });
    fireEvent.blur(field());
    expect(screen.getByRole('alert').textContent).toBe(BANDING_RANGE);
    fireEvent.change(field(), { target: { value: 'A1:D3' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe(BANDING_OVERLAP);
    fireEvent.change(field(), { target: { value: 'A1:B9' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(h.ctl().selection.ranges[0]).toEqual({ r1: 0, c1: 0, r2: 8, c2: 1 });
    expect(field().value).toBe('A1:B9');
    // Unchanged, nothing is written; another key does nothing.
    fireEvent.keyDown(field(), { key: 'a' });
    fireEvent.blur(field());
    expect(bands(h)).toHaveLength(2);
  });
});
