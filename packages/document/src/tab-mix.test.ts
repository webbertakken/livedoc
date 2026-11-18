import { describe, expect, it } from 'vitest';
import { tabMixRefusal } from './tab-mix';

// docs/specs/029-sheets/spreadsheet.md "The workbook shape": a spreadsheet holds only sheet tabs; until Plan's Sheet
// tabs are migrated, a sheet tab outside a spreadsheet is a Plan Sheet tab, still allowed (default).
describe('tabMixRefusal', () => {
  it('lets a spreadsheet hold sheet tabs', () => {
    expect(tabMixRefusal(true, [{ kind: 'sheet' }, { kind: 'sheet' }])).toBeNull();
  });

  it('refuses any other kind in a spreadsheet', () => {
    expect(tabMixRefusal(true, [{ kind: 'sheet' }, { kind: 'board' }])).toBe('tab_kind_mixed');
    expect(tabMixRefusal(true, [{ kind: 'text-document' }])).toBe('tab_kind_mixed');
  });

  it('refuses a tab with no kind in a spreadsheet, since it reads as a diagram', () => {
    expect(tabMixRefusal(true, [{}])).toBe('tab_kind_mixed');
  });

  it('leaves a document that is no spreadsheet to its own rules, Plan Sheet tabs included', () => {
    expect(tabMixRefusal(false, [{ kind: 'sheet' }, { kind: 'board' }, {}])).toBeNull();
  });
});
