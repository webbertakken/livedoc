import { describe, expect, it } from 'vitest';
import {
  lucideAlignCenter,
  lucideAlignLeft,
  lucideAlignVerticalJustifyCenter,
  lucideArrowRightToLine,
  lucideArrowUpRight,
  lucideRotateCcw,
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
    'rotate-tilt-up': { run, checked: true },
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
    // formatting.md "Alignment, wrapping, rotation": Text Rotation opens Format › Rotation.
    expect(ids(choices['text-rotation']!.entries)).toEqual([
      'rotate-none',
      'rotate-tilt-up',
      'rotate-tilt-down',
      'rotate-stack-vertically',
      'rotate-up',
      'rotate-down',
      'rotate-custom-angle',
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
    expect(choices['text-rotation']!.read()).toBe('Tilt Up');
    expect(choices['text-rotation']!.iconOf!('Tilt Up')).toBe(lucideArrowUpRight);
    // A custom angle ticks none: Text Rotation's own glyph.
    expect(choices['text-rotation']!.iconOf!(null)).toBe(lucideRotateCcw);
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

// surface.md "Toolbar": Create a Filter's chevron lists Data's filter items, then the sheet's saved views.
describe('the Create a Filter options', () => {
  it('lists Create a Filter, Create Group by View and Create Filter View, then each saved view', () => {
    const withViews = spreadsheetMenus('ods', 'en-GB', [], ['No plums', 'Group 1']);
    const choices = spreadsheetChoices(withViews, { 'create-filter-view': { run } });
    expect(ids(choices['create-a-filter']!.entries)).toEqual([
      'create-a-filter',
      'create-group-by-view',
      'create-filter-view',
      'filter-view-0',
      'filter-view-1',
    ]);
    expect(choices['create-a-filter']!.entries.filter((e) => e.kind === 'separator')).toHaveLength(
      1,
    );
  });

  it('lists the creating items alone while the sheet has no view', () => {
    const choices = spreadsheetChoices(catalogue, { 'create-filter-view': { run } });
    expect(ids(choices['create-a-filter']!.entries)).toEqual([
      'create-a-filter',
      'create-group-by-view',
      'create-filter-view',
    ]);
  });
});
