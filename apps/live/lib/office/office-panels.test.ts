// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampPanelWidth,
  OFFICE_PANEL_WIDTH,
  OpenPanels,
  type OfficePanelSpec,
} from './office-panels';
import {
  OFFICE_PANEL_WIDTH_KEY,
  OFFICE_PANELS_KEY,
  readOfficePanelWidth,
  readOpenPanels,
  writeOfficePanelWidth,
  writeOpenPanels,
} from './office-panel-store';

const OUTLINE: OfficePanelSpec = {
  id: 'outline',
  title: 'Outline',
  side: 'left',
  item: 'show-outline',
};
const COMMENTS: OfficePanelSpec = {
  id: 'comments',
  title: 'Comments',
  side: 'right',
  item: 'comment-history',
};
const HISTORY: OfficePanelSpec = {
  id: 'history',
  title: 'Version history',
  side: 'right',
  item: 'see-version-history',
};
const PANELS = [OUTLINE, COMMENTS, HISTORY];

// docs/specs/004-interface-design/office-shell.md "Side panels".
describe('OpenPanels', () => {
  it('opens one panel a side, a second on the same side replacing the first', () => {
    let open = OpenPanels.toggle(OpenPanels.none, OUTLINE);
    open = OpenPanels.toggle(open, COMMENTS);
    expect(open).toEqual({ left: 'outline', right: 'comments' });
    open = OpenPanels.toggle(open, HISTORY);
    expect(open).toEqual({ left: 'outline', right: 'history' });
  });

  it('closes a panel chosen again, and a side on its own', () => {
    const open = OpenPanels.toggle(OpenPanels.toggle(OpenPanels.none, OUTLINE), COMMENTS);
    expect(OpenPanels.toggle(open, OUTLINE)).toEqual({ left: null, right: 'comments' });
    expect(OpenPanels.close(open, 'right')).toEqual({ left: 'outline', right: null });
  });

  it('reads a stored value, dropping what is not a declared panel of its side', () => {
    expect(OpenPanels.parse({ left: 'outline', right: 'history' }, PANELS)).toEqual({
      left: 'outline',
      right: 'history',
    });
    expect(OpenPanels.parse({ left: 'comments', right: 'gone' }, PANELS)).toEqual(OpenPanels.none);
    expect(OpenPanels.parse('nonsense', PANELS)).toEqual(OpenPanels.none);
  });

  it('reads a panel open on one object as closed: it is never remembered', () => {
    const editor = {
      id: 'editor',
      title: 'Editor',
      side: 'right' as const,
      item: 'edit',
      object: true as const,
    };
    expect(OpenPanels.parse({ left: 'outline', right: 'editor' }, [...PANELS, editor])).toEqual({
      left: 'outline',
      right: null,
    });
  });
});

describe('clampPanelWidth', () => {
  it('holds a width between the narrowest and the widest', () => {
    expect(clampPanelWidth(100)).toBe(OFFICE_PANEL_WIDTH.min);
    expect(clampPanelWidth(9000)).toBe(OFFICE_PANEL_WIDTH.max);
    expect(clampPanelWidth(400.4)).toBe(400);
    expect(clampPanelWidth(Number.NaN)).toBe(OFFICE_PANEL_WIDTH.initial);
  });
});

describe('the panel store', () => {
  afterEach(() => localStorage.clear());

  it('remembers the right panel width, clamped, and starts at 360 px', () => {
    expect(readOfficePanelWidth()).toBe(360);
    writeOfficePanelWidth(420);
    expect(readOfficePanelWidth()).toBe(420);
    localStorage.setItem(OFFICE_PANEL_WIDTH_KEY, '9000');
    expect(readOfficePanelWidth()).toBe(560);
    localStorage.setItem(OFFICE_PANEL_WIDTH_KEY, 'wide');
    expect(readOfficePanelWidth()).toBe(360);
  });

  it('remembers the open panels per kind', () => {
    expect(readOpenPanels('TextDocument', PANELS)).toEqual(OpenPanels.none);
    writeOpenPanels('TextDocument', { left: 'outline', right: null });
    writeOpenPanels('Spreadsheet', { left: null, right: 'comments' });
    expect(readOpenPanels('TextDocument', PANELS)).toEqual({ left: 'outline', right: null });
    expect(readOpenPanels('Spreadsheet', PANELS)).toEqual({ left: null, right: 'comments' });
    localStorage.setItem(OFFICE_PANELS_KEY, '{not json');
    expect(readOpenPanels('TextDocument', PANELS)).toEqual(OpenPanels.none);
  });
});
