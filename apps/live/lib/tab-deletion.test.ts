import { describe, expect, it } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import { FORM_TAB_DELETE_WARNING } from '@/hooks/forms/forms-feeding';
import {
  LAST_TAB_BLOCKED_REASON,
  LAST_TAB_CONFIRM,
  LOCKED_TAB_REASON,
  TAB_WARNING_MESSAGE,
  deleteDescription,
  tabDeletion,
} from './tab-deletion';

// What the tab menu's Delete does (docs/specs/006-document/document-structure.md "Deleting a tab", "The last tab").

const box = {
  id: 'e',
  type: 'shape',
  shape: 'rect',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
} as unknown as Element;
const tab = (id: string, over: Partial<Tab> = {}): Tab => ({ id, name: id, elements: [], ...over });
const loaded = () => true;

describe('tabDeletion: one tab among several', () => {
  it('deletes the tab at once, whatever the session may do with the document', () => {
    const tabs = [tab('a', { elements: [box] }), tab('b')];
    for (const canDeleteDocument of [true, false]) {
      expect(tabDeletion({ tabs, tabId: 'a', canDeleteDocument, isTabLoaded: loaded })).toEqual({
        kind: 'tab',
      });
    }
  });

  it('asks first, with the warning, when deleting does what an undo cannot take back', () => {
    const tabs = [tab('a', { kind: 'form', form: {} as Tab['form'] }), tab('b')];
    expect(tabDeletion({ tabs, tabId: 'a', canDeleteDocument: true, isTabLoaded: loaded })).toEqual(
      {
        kind: 'tab',
        confirm: {
          message: TAB_WARNING_MESSAGE,
          warning: FORM_TAB_DELETE_WARNING,
          confirmLabel: 'Delete',
        },
      },
    );
  });

  it('is blocked on a locked tab', () => {
    const tabs = [tab('a', { locked: true }), tab('b')];
    expect(tabDeletion({ tabs, tabId: 'a', canDeleteDocument: true, isTabLoaded: loaded })).toEqual(
      {
        kind: 'blocked',
        reason: LOCKED_TAB_REASON,
      },
    );
  });

  it('is blocked on a tab the document does not hold', () => {
    const tabs = [tab('a'), tab('b')];
    expect(
      tabDeletion({ tabs, tabId: 'gone', canDeleteDocument: true, isTabLoaded: loaded }).kind,
    ).toBe('blocked');
  });
});

describe('tabDeletion: the last tab', () => {
  it('deletes an empty last tab with its document, asking nothing', () => {
    expect(
      tabDeletion({ tabs: [tab('a')], tabId: 'a', canDeleteDocument: true, isTabLoaded: loaded }),
    ).toEqual({ kind: 'document' });
  });

  it.each<[string, Partial<Tab>]>([
    ['an element', { elements: [box] }],
    ['an article', { articles: { f: { blocks: [] } } }],
    ['a form', { kind: 'form', form: {} as Tab['form'] }],
  ])('asks first when the last tab holds %s', (_, over) => {
    expect(
      tabDeletion({
        tabs: [tab('a', over)],
        tabId: 'a',
        canDeleteDocument: true,
        isTabLoaded: loaded,
      }),
    ).toEqual({ kind: 'document', confirm: LAST_TAB_CONFIRM });
  });

  it('asks first when the last tab has not loaded, whatever it shows', () => {
    expect(
      tabDeletion({
        tabs: [tab('a')],
        tabId: 'a',
        canDeleteDocument: true,
        isTabLoaded: () => false,
      }),
    ).toEqual({ kind: 'document', confirm: LAST_TAB_CONFIRM });
  });

  it('is blocked for a session that may not delete the document (an Editor, a workbench)', () => {
    expect(
      tabDeletion({ tabs: [tab('a')], tabId: 'a', canDeleteDocument: false, isTabLoaded: loaded }),
    ).toEqual({ kind: 'blocked', reason: LAST_TAB_BLOCKED_REASON });
  });

  it('is blocked on a locked last tab, the lock named first', () => {
    expect(
      tabDeletion({
        tabs: [tab('a', { locked: true })],
        tabId: 'a',
        canDeleteDocument: true,
        isTabLoaded: loaded,
      }),
    ).toEqual({ kind: 'blocked', reason: LOCKED_TAB_REASON });
  });

  it('confirms with the document named, and Delete Document', () => {
    expect(LAST_TAB_CONFIRM).toEqual({
      message: 'Delete this document?',
      warning: 'This is its only tab, so the whole document goes to the Trash.',
      confirmLabel: 'Delete Document',
    });
  });
});

describe('deleteDescription', () => {
  it('says what Delete does, or why it cannot', () => {
    expect(deleteDescription({ kind: 'tab' })).toBe('Delete this tab.');
    expect(deleteDescription({ kind: 'document' })).toBe('Delete this tab and its document.');
    expect(deleteDescription({ kind: 'blocked', reason: LOCKED_TAB_REASON })).toBe(
      LOCKED_TAB_REASON,
    );
  });
});
