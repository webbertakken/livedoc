// @vitest-environment jsdom
// docs/specs/029-sheets/surface.md "Phone and tablet": on a phone the formula bar shows only while a cell is edited
// (ruled by the director); "Layout": Full Screen's Exit button (D187).
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import type { FormulaInput } from '@/components/sheets/useFormulaInput';
import { PHONE_MEDIA_QUERY } from '@/lib/responsive';
import { SpreadsheetFullScreenProvider } from './spreadsheet-full-screen';
import { SpreadsheetFormulaBarRow } from './SpreadsheetFormulaBarRow';

let editing: object | null = null;
vi.mock('@/components/sheets/sheet-controller', () => ({
  useSheetController: () => ({ editing }),
}));
vi.mock('@/components/sheets/SheetFormulaBar', () => ({
  SheetFormulaBar: () => <div>formula bar</div>,
}));

function stubPhone(isPhone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE_MEDIA_QUERY ? isPhone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  editing = null;
});

const props = { actions: {} as SheetActions, input: {} as FormulaInput };

describe('SpreadsheetFormulaBarRow', () => {
  it('always draws the formula bar off a phone', () => {
    stubPhone(false);
    render(<SpreadsheetFormulaBarRow {...props} />);
    expect(screen.getByText('formula bar')).toBeTruthy();
  });

  it('draws it on a phone only while a cell is edited', () => {
    stubPhone(true);
    const { container, rerender } = render(<SpreadsheetFormulaBarRow {...props} />);
    expect(container.innerHTML).toBe('');
    editing = { r: 0, c: 0 };
    rerender(<SpreadsheetFormulaBarRow {...props} />);
    expect(screen.getByText('formula bar')).toBeTruthy();
  });

  it('keeps Full Screen’s Exit button on a phone with no edit, and leaves by it', () => {
    stubPhone(true);
    const exit = vi.fn(() => true);
    render(
      <SpreadsheetFullScreenProvider value={{ on: true, enter: vi.fn(), exit }}>
        <SpreadsheetFormulaBarRow {...props} />
      </SpreadsheetFullScreenProvider>,
    );
    expect(screen.queryByText('formula bar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit Full Screen' }));
    expect(exit).toHaveBeenCalledOnce();
  });
});
