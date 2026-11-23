// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Side panels": a kind's left panels on a rail, a vertical toolbar of
// glyph toggles, one a panel, each named, pressed while its panel is open.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lucideBookmark, lucideGalleryVertical } from '@livedoc/icons/lucide';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { OfficePanelRail, type OfficeRailPanel } from './OfficePanelRail';

const PANELS: OfficeRailPanel[] = [
  {
    spec: { id: 'thumbnails', title: 'Thumbnails', side: 'left', item: 'panel-thumbnails' },
    icon: lucideGalleryVertical,
  },
  {
    spec: { id: 'outline', title: 'Outline', side: 'left', item: 'panel-outline' },
    icon: lucideBookmark,
  },
];

function rail(actions: OfficeActions) {
  render(<OfficePanelRail panels={PANELS} actions={actions} />);
  return screen.getByRole('toolbar', { name: 'Panels' });
}

describe('the panel rail', () => {
  it('is a vertical toolbar of a toggle a panel, named, pressed while open', () => {
    const toolbar = rail({
      'panel-thumbnails': { run: vi.fn(), checked: true },
      'panel-outline': { run: vi.fn(), checked: false },
    });
    expect(toolbar.getAttribute('aria-orientation')).toBe('vertical');
    expect(toolbar.dataset.region).toBe('rail');
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Thumbnails', 'true'],
      ['Outline', 'false'],
    ]);
  });

  it('runs a panel’s item when its button is pressed', () => {
    const outline = vi.fn();
    rail({ 'panel-thumbnails': { run: vi.fn() }, 'panel-outline': { run: outline } });
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(outline).toHaveBeenCalledOnce();
  });

  it('draws no button for a panel nothing opens', () => {
    rail({ 'panel-outline': { run: vi.fn() } });
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Outline',
    ]);
  });

  it('takes one tab stop, Up and Down moving between its buttons, Home and End to its ends', () => {
    rail({ 'panel-thumbnails': { run: vi.fn() }, 'panel-outline': { run: vi.fn() } });
    const [first, second] = screen.getAllByRole('button') as [HTMLElement, HTMLElement];
    expect([first.tabIndex, second.tabIndex]).toEqual([0, -1]);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    expect([first.tabIndex, second.tabIndex]).toEqual([-1, 0]);
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'End' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(second);
  });

  it('draws nothing with no panel to open', () => {
    render(<OfficePanelRail panels={PANELS} actions={{}} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
