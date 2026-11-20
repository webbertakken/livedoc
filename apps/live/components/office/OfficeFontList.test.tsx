// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "More fonts": the list draws only the rows in view, the room it has.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MoreFontsFamily } from '@/lib/office/office-more-fonts';
import { FONT_ROW_PX, OfficeFontList, PREVIEW_REST_MS } from './OfficeFontList';

const ROWS: MoreFontsFamily[] = Array.from({ length: 200 }, (_, i) => ({
  name: `Family ${String(i).padStart(3, '0')}`,
  category: 'Serif',
  google: null,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OfficeFontList', () => {
  it('draws the rows in view and a few past them, each telling its place', () => {
    render(<OfficeFontList rows={ROWS} chosen={[]} onToggle={() => {}} onPreview={() => {}} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(15);
    expect(options[0]!.getAttribute('aria-posinset')).toBe('1');
    expect(options[0]!.getAttribute('aria-setsize')).toBe('200');
  });

  it('draws the rows the scroll brings into view, and previews them once it rests', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn<(rows: readonly MoreFontsFamily[]) => void>();
    render(<OfficeFontList rows={ROWS} chosen={[]} onToggle={() => {}} onPreview={onPreview} />);
    const list = screen.getByRole('listbox');
    list.scrollTop = 100 * FONT_ROW_PX;
    fireEvent.scroll(list);
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toBe('Family 095');
    expect(names).toContain('Family 109');
    act(() => {
      vi.advanceTimersByTime(PREVIEW_REST_MS);
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0]![0][0]?.name).toBe('Family 095');
  });

  it('fits the rows to the room it is given', () => {
    let resized: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(<OfficeFontList rows={ROWS} chosen={[]} onToggle={() => {}} onPreview={() => {}} />);
    const list = screen.getByRole('listbox');
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 720 });
    act(() => resized());
    expect(screen.getAllByRole('option')).toHaveLength(25);
    fireEvent.keyDown(list, { key: 'PageDown' });
    expect(list.getAttribute('aria-activedescendant')).toMatch(/-20$/);
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 0 });
    act(() => resized());
    // Back to 360 px, one row down since the move scrolled.
    expect(screen.getAllByRole('option')).toHaveLength(16);
  });

  it('scrolls the active row into view, either way', () => {
    render(<OfficeFontList rows={ROWS} chosen={[]} onToggle={() => {}} onPreview={() => {}} />);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'End' });
    expect(list.scrollTop).toBe(200 * FONT_ROW_PX - 360);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(list.scrollTop).toBe(0);
  });

  it('chooses a row by a press', () => {
    const onToggle = vi.fn();
    render(
      <OfficeFontList
        rows={ROWS}
        chosen={['Family 001']}
        onToggle={onToggle}
        onPreview={() => {}}
      />,
    );
    const second = screen.getByRole('option', { name: 'Family 001' });
    expect(second.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(second);
    expect(onToggle).toHaveBeenCalledWith('Family 001');
    expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBe(second.id);
  });

  it('has no active row, nor previews, when it is empty', () => {
    const onPreview = vi.fn();
    const onToggle = vi.fn();
    render(<OfficeFontList rows={[]} chosen={[]} onToggle={onToggle} onPreview={onPreview} />);
    const list = screen.getByRole('listbox');
    expect(list.hasAttribute('aria-activedescendant')).toBe(false);
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
