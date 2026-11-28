// @vitest-environment jsdom
// docs/specs/029-sheets/inserted-objects.md "The link card": a web address opens in a new tab; a sheet of the
// workbook through the spreadsheet's way there, and nowhere where the grid has none (a Plan Sheet).
import { describe, expect, it, vi } from 'vitest';
import { followCellLink } from './sheet-link-follow-context';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('followCellLink', () => {
  it('opens a web address in a new tab with no opener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(followCellLink({ k: 'web', href: 'https://docs.nu/' }, null)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://docs.nu/', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('opens a sheet through the way given, and nothing without one', () => {
    const to = vi.fn();
    const target = { k: 'sheet' as const, sheetId: 's2' };
    expect(followCellLink(target, to)).toBe(true);
    expect(to).toHaveBeenCalledWith(target);
    expect(followCellLink(target, null)).toBe(false);
  });
});
