import { describe, expect, it } from 'vitest';
import {
  lucideAlignCenter,
  lucideAlignLeft,
  lucideAlignVerticalJustifyCenter,
  lucideArrowRightToLine,
  lucideWrapText,
} from '@livedoc/icons/lucide';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { spreadsheetChoices } from './spreadsheet-choices';
import { spreadsheetMenus } from './spreadsheet-menus';

const run = () => {};
const catalogue = spreadsheetMenus('ods', 'en-GB');
const ids = (entries: readonly { kind: string; id?: string }[]) =>
  entries.flatMap((e) => (e.kind === 'item' ? [e.id] : []));

// docs/specs/029-sheets/surface.md "Toolbar": the choice controls open Format's own choices.
describe('spreadsheetChoices', () => {
  const actions: OfficeActions = {
    'number-percent': { run, checked: true },
    'number-automatic': { run, checked: false },
    'align-centre': { run, checked: true },
    'align-left': { run },
    'align-middle': { run, checked: true },
    'wrap-wrap': { run, checked: true },
  };
  const choices = spreadsheetChoices(catalogue, actions);

  it('opens Format › Number, Alignment split by direction, and Wrapping', () => {
    expect(ids(choices['more-formats']!.entries)).toContain('number-currency');
    expect(ids(choices['horizontal-align']!.entries)).toEqual([
      'align-left',
      'align-centre',
      'align-right',
    ]);
    expect(ids(choices['vertical-align']!.entries)).toEqual([
      'align-top',
      'align-middle',
      'align-bottom',
    ]);
    expect(ids(choices['text-wrapping']!.entries)).toEqual([
      'wrap-overflow',
      'wrap-wrap',
      'wrap-clip',
    ]);
  });

  it('names the choice in force and draws its glyph', () => {
    expect(choices['more-formats']!.read()).toBe('Percent');
    expect(choices['more-formats']!.iconOf).toBeUndefined();
    expect(choices['horizontal-align']!.read()).toBe('Centre');
    expect(choices['horizontal-align']!.iconOf!('Centre')).toBe(lucideAlignCenter);
    expect(choices['horizontal-align']!.iconOf!(null)).toBe(lucideAlignLeft);
    expect(choices['vertical-align']!.iconOf!('Middle')).toBe(lucideAlignVerticalJustifyCenter);
    expect(choices['text-wrapping']!.iconOf!('Wrap')).toBe(lucideWrapText);
    expect(choices['text-wrapping']!.iconOf!('Nothing')).toBe(lucideArrowRightToLine);
  });

  it('reads none where nothing is ticked', () => {
    expect(
      spreadsheetChoices(catalogue, { 'align-left': { run } })['horizontal-align']!.read(),
    ).toBeNull();
  });

  it('draws no choice the grid binds nothing of, as for a Viewer', () => {
    expect(Object.keys(spreadsheetChoices(catalogue, { copy: { run } }))).toEqual([]);
    expect(Object.keys(spreadsheetChoices([], { 'align-left': { run } }))).toEqual([]);
  });
});
