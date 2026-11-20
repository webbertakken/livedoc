import { describe, expect, it } from 'vitest';
import { controlsThatFit, visibleToolbar, type OfficeToolbar } from './office-toolbar';

const icon = { kind: 'icon', icon: [] } as const;
const TOOLBAR: OfficeToolbar = [
  {
    id: 'history',
    label: 'History',
    controls: [
      { id: 'undo', label: 'Undo', level: 'edit', status: 'built', look: icon },
      { id: 'print', label: 'Print', level: 'view', status: 'comingSoon', look: icon },
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    controls: [
      { id: 'zoom', label: 'Zoom', level: 'view', status: 'built', look: { kind: 'zoom' } },
    ],
  },
  {
    id: 'font',
    label: 'Font',
    controls: [
      {
        id: 'font-size',
        label: 'Font size',
        level: 'edit',
        status: 'built',
        look: { kind: 'fontSize' },
      },
      {
        id: 'text-colour',
        label: 'Text colour',
        level: 'edit',
        status: 'built',
        look: { kind: 'colour', icon: [] },
      },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    controls: [
      { id: 'comment', label: 'Add comment', level: 'participate', status: 'built', look: icon },
    ],
  },
];

// docs/specs/004-interface-design/office-shell.md "Toolbar".
describe('visibleToolbar', () => {
  const run = () => {};
  const BOTH = { zoom: true, fontSize: true, font: true, colour: true };
  const NEITHER = { zoom: false, fontSize: false, font: false, colour: false };

  it('keeps what the level sees, bound or coming soon', () => {
    const shown = visibleToolbar(TOOLBAR, 'edit', { undo: { run }, comment: { run } }, BOTH);
    expect(shown.flatMap((g) => g.controls.map((c) => c.id))).toEqual([
      'undo',
      'print',
      'zoom',
      'font-size',
      'text-colour',
      'comment',
    ]);
  });

  it('shows each value field only when the shell binds it', () => {
    const shown = visibleToolbar(TOOLBAR, 'edit', {}, {
      zoom: false,
      fontSize: true,
      font: false,
      colour: false,
    });
    expect(shown.flatMap((g) => g.controls.map((c) => c.id))).toEqual(['print', 'font-size']);
    const coloured = visibleToolbar(TOOLBAR, 'edit', {}, { ...NEITHER, colour: true });
    expect(coloured.flatMap((g) => g.controls.map((c) => c.id))).toEqual(['print', 'text-colour']);
  });

  it('drops a built control left unbound, a field unbound, and a group left empty', () => {
    const shown = visibleToolbar(TOOLBAR, 'edit', {}, NEITHER);
    expect(shown.map((g) => g.id)).toEqual(['history']);
    expect(shown[0]!.controls.map((c) => c.id)).toEqual(['print']);
  });

  it('shows a Viewer what a Viewer may use', () => {
    const shown = visibleToolbar(TOOLBAR, 'view', { undo: { run }, comment: { run } }, BOTH);
    expect(shown.flatMap((g) => g.controls.map((c) => c.id))).toEqual(['print', 'zoom']);
  });
});

describe('controlsThatFit', () => {
  const w = (width: number, startsGroup = false) => ({ width, startsGroup });

  it('fits everything that fits, More and all', () => {
    expect(controlsThatFit([w(30, true), w(30), w(30, true)], 100, 9, 32)).toBe(3);
  });

  it('counts the dividers between groups, never before the first', () => {
    expect(controlsThatFit([w(30, true), w(30, true)], 69, 9, 32)).toBe(2);
    expect(controlsThatFit([w(30, true), w(30, true)], 68, 9, 32)).toBe(1);
  });

  it('keeps room for More once anything moves', () => {
    expect(controlsThatFit([w(30), w(30), w(30), w(30)], 100, 9, 32)).toBe(2);
  });
});
