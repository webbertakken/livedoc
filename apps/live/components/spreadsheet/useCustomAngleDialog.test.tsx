// @vitest-environment jsdom
// formatting.md "Alignment, wrapping, rotation" (D211): Custom Angle opens the shell's dialog at the active cell's
// angle; Apply turns the selection, 0 clears it, anything else dims Apply and says why; Cancel changes nothing.
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { CUSTOM_ANGLE_PROBLEM } from '@/lib/spreadsheet/custom-angle';
import { useCustomAngleDialog } from './useCustomAngleDialog';

beforeAll(stubResizeObserver);

function Host({ actions }: { actions: SheetActions }) {
  const { openCustomAngle, dialog } = useCustomAngleDialog(actions);
  return (
    <>
      <button type="button" onClick={openCustomAngle}>
        Custom Angle
      </button>
      {dialog}
    </>
  );
}

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Angle in degrees' });
const apply = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' });

describe('useCustomAngleDialog', () => {
  it('starts at the active cell’s angle and turns the selection by the one typed', async () => {
    const h = await makeSheet({ cells: { A1: 'a', A2: 'b' }, format: { A1: { ro: 45 } } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1:A2' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom Angle' }));
    expect(screen.getByRole('dialog', { name: 'Custom Angle' })).toBeTruthy();
    expect(field().value).toBe('45');
    fireEvent.change(field(), { target: { value: '-30' } });
    fireEvent.click(apply());
    expect([h.cell('A1')?.format?.ro, h.cell('A2')?.format?.ro]).toEqual([-30, -30]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clears the rotation at 0', async () => {
    const h = await makeSheet({ cells: { A1: 'a' }, format: { A1: { ro: 'v' } } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom Angle' }));
    expect(field().value).toBe('0');
    fireEvent.click(apply());
    expect(h.cell('A1')?.format?.ro).toBeUndefined();
  });

  it('dims Apply and says why for an angle it cannot take, and Cancel changes nothing', async () => {
    const h = await makeSheet({ cells: { A1: 'a' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom Angle' }));
    fireEvent.change(field(), { target: { value: '95' } });
    expect(apply().disabled).toBe(true);
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe(CUSTOM_ANGLE_PROBLEM);
    fireEvent.click(apply());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cell('A1')?.format?.ro).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
