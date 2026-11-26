import { describe, expect, it } from 'vitest';
import type { OfficeActions, OfficeCatalogue, OfficeEntry } from './office-catalogue';
import { officeItemLevels, proposalActions, proposalChoices } from './office-proposals';
import type { OfficeToolbar } from './office-toolbar';

// docs/specs/004-interface-design/office-shell.md "Modes": in a mode drawn above the session's level, an item above it
// runs only when the mode names it as one a proposal can carry; every other one is dimmed.
const item = (id: string, level: 'view' | 'participate' | 'edit'): OfficeEntry => ({
  kind: 'item',
  id,
  label: id,
  level,
  status: 'built',
});

const CATALOGUE: OfficeCatalogue = [
  {
    id: 'format',
    label: 'Format',
    entries: [
      item('bold', 'edit'),
      { kind: 'submenu', id: 'setup', label: 'Setup', entries: [item('page-setup', 'edit')] },
      item('comment', 'participate'),
      item('copy', 'view'),
    ],
  },
];

const TOOLBAR: OfficeToolbar = [
  {
    id: 'text',
    label: 'Text',
    controls: [
      {
        id: 'paint-format',
        label: 'Paint format',
        level: 'edit',
        status: 'built',
        look: { kind: 'icon', icon: [] },
      },
    ],
  },
];

// A context menu offering Copy to fewer than the menu does, and an item of its own.
const CONTEXT: readonly OfficeEntry[] = [
  { ...(item('copy', 'edit') as Extract<OfficeEntry, { kind: 'item' }>) },
  item('copy-heading-link', 'edit'),
];

const run = () => undefined;
const bound = (ids: readonly string[]): OfficeActions =>
  Object.fromEntries(ids.map((id) => [id, { run }]));

describe('officeItemLevels', () => {
  it('reads each id’s least level across the menus, the toolbar and the context menu', () => {
    const levels = officeItemLevels(CATALOGUE, TOOLBAR, CONTEXT);
    expect(levels.get('bold')).toBe('edit');
    expect(levels.get('page-setup')).toBe('edit');
    expect(levels.get('comment')).toBe('participate');
    expect(levels.get('paint-format')).toBe('edit');
    // Drawn for a Viewer in the menu, for an Editor in the context menu: reached at view.
    expect(levels.get('copy')).toBe('view');
    expect(levels.get('copy-heading-link')).toBe('edit');
  });
});

describe('proposalActions', () => {
  const levels = officeItemLevels(CATALOGUE, TOOLBAR, CONTEXT);
  const actions = bound([
    'bold',
    'page-setup',
    'comment',
    'copy',
    'paint-format',
    'copy-heading-link',
    'shortcut-only',
  ]);

  it('leaves every action as it is when the mode is not drawn above the session', () => {
    expect(proposalActions(actions, levels, null)).toBe(actions);
  });

  it('dims what is above the session’s level unless the mode names it', () => {
    const out = proposalActions(actions, levels, {
      below: 'participate',
      runs: new Set(['bold', 'paint-format']),
    });
    expect(out.bold?.disabled).toBeUndefined();
    expect(out['paint-format']?.disabled).toBeUndefined();
    expect(out['page-setup']?.disabled).toBe(true);
    expect(out['copy-heading-link']?.disabled).toBe(true);
    // At or below the session's level: as it was.
    expect(out.comment?.disabled).toBeUndefined();
    expect(out.copy?.disabled).toBeUndefined();
    // A shortcut no item draws was never level-gated.
    expect(out['shortcut-only']?.disabled).toBeUndefined();
  });

  it('keeps an action already dimmed dimmed, and what it reads', () => {
    const out = proposalActions({ bold: { run, disabled: true, checked: true } }, levels, {
      below: 'participate',
      runs: new Set(['bold']),
    });
    expect(out.bold).toEqual({ run, disabled: true, checked: true });
  });

  it('keeps a dimmed action’s state but never lets it run', () => {
    const out = proposalActions({ 'page-setup': { run, checked: true } }, levels, {
      below: 'participate',
      runs: new Set(),
    });
    expect(out['page-setup']).toEqual({ run, checked: true, disabled: true });
  });
});

describe('proposalChoices', () => {
  const levels = officeItemLevels(CATALOGUE, TOOLBAR, CONTEXT);
  const proposals = { below: 'participate' as const, runs: new Set(['paint-format', 'bold']) };
  const choice = (ids: readonly string[]) => ({
    read: () => null,
    entries: [],
    actions: bound(ids),
  });

  it('leaves the choices as they are when the mode is not drawn above the session', () => {
    const choices = { 'paint-format': choice(['bold']) };
    expect(proposalChoices(choices, levels, null)).toBe(choices);
    expect(proposalChoices(null, levels, proposals)).toBeNull();
  });

  it('dims every cell of a control above the session’s level that is no proposal', () => {
    const out = proposalChoices(
      { 'numbered-list': choice(['bold', 'grid-cell']) },
      new Map([...levels, ['numbered-list', 'edit']]),
      proposals,
    );
    expect(out!['numbered-list']!.actions.bold?.disabled).toBe(true);
    expect(out!['numbered-list']!.actions['grid-cell']?.disabled).toBe(true);
  });

  it('narrows a proposal’s control item by item', () => {
    const out = proposalChoices(
      { 'paint-format': choice(['bold', 'page-setup', 'grid-cell']) },
      levels,
      proposals,
    );
    const actions = out!['paint-format']!.actions;
    expect(actions.bold?.disabled).toBeUndefined();
    expect(actions['page-setup']?.disabled).toBe(true);
    // A cell no menu draws, in a control that is a proposal.
    expect(actions['grid-cell']?.disabled).toBeUndefined();
  });
});

describe('a shut choice', () => {
  it('opens no panel of its own', () => {
    const out = proposalChoices(
      {
        borders: { read: () => null, entries: [], actions: {}, panel: () => null },
      },
      new Map([['borders', 'edit']]),
      { below: 'participate', runs: new Set() },
    );
    expect(out!.borders!.panel).toBeUndefined();
  });
});
