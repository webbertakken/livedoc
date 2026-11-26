import { describe, expect, it } from 'vitest';
import { lucideEye, lucidePencil } from '@livedoc/icons/lucide';
import {
  levelInMode,
  modesFor,
  proposalsInMode,
  startingMode,
  type OfficeModeInfo,
} from './office-mode';

// docs/specs/004-interface-design/office-shell.md "Modes": a kind's own set of modes, each reached from a least level,
// drawn at no more than the session's level; a person starts in the first built mode their level reaches.
const PDF_LIKE: readonly OfficeModeInfo<'editing' | 'reviewing' | 'viewing'>[] = [
  {
    mode: 'editing',
    label: 'Editing',
    description: 'Edit the pages',
    icon: lucidePencil,
    level: 'edit',
    drawnAt: 'edit',
    status: 'comingSoon',
    item: 'mode-editing',
  },
  {
    mode: 'reviewing',
    label: 'Reviewing',
    description: 'Mark, comment, fill in and sign',
    icon: lucidePencil,
    level: 'participate',
    drawnAt: 'participate',
    status: 'built',
    item: 'mode-reviewing',
  },
  {
    mode: 'viewing',
    label: 'Viewing',
    description: 'Read the pages',
    icon: lucideEye,
    level: 'view',
    drawnAt: 'view',
    status: 'built',
    item: 'mode-viewing',
  },
];

describe("a kind's modes", () => {
  it('lists the modes a level reaches, in the kind\u2019s order', () => {
    expect(modesFor(PDF_LIKE, 'edit').map((m) => m.mode)).toEqual([
      'editing',
      'reviewing',
      'viewing',
    ]);
    expect(modesFor(PDF_LIKE, 'participate').map((m) => m.mode)).toEqual(['reviewing', 'viewing']);
    expect(modesFor(PDF_LIKE, 'view').map((m) => m.mode)).toEqual(['viewing']);
  });

  it('starts at the first built mode a level reaches, else the kind\u2019s last', () => {
    // Editing is not built: an Editor starts in Reviewing.
    expect(startingMode(PDF_LIKE, 'edit')).toBe('reviewing');
    expect(startingMode(PDF_LIKE, 'participate')).toBe('reviewing');
    expect(startingMode(PDF_LIKE, 'view')).toBe('viewing');
    const unbuilt = PDF_LIKE.map((m) => ({ ...m, status: 'comingSoon' as const }));
    expect(startingMode(unbuilt, 'edit')).toBe('viewing');
  });

  it('draws a mode at its own level, never more than the session\u2019s', () => {
    expect(levelInMode(PDF_LIKE, 'edit', 'reviewing')).toBe('participate');
    expect(levelInMode(PDF_LIKE, 'edit', 'editing')).toBe('edit');
    expect(levelInMode(PDF_LIKE, 'view', 'reviewing')).toBe('view');
    expect(levelInMode(PDF_LIKE, 'participate', 'viewing')).toBe('view');
  });
});

// office-shell.md "Modes": a mode whose changes are proposals the room judges is drawn at its own level even for a
// session below it, and names the items a proposal can carry.
const PROPOSING: readonly OfficeModeInfo<'editing' | 'suggesting' | 'viewing'>[] = [
  { ...PDF_LIKE[0]!, mode: 'editing', status: 'built' },
  {
    ...PDF_LIKE[1]!,
    mode: 'suggesting',
    drawnAt: 'edit',
    item: 'mode-suggesting',
    proposes: ['bold', 'undo'],
  },
  { ...PDF_LIKE[2]!, mode: 'viewing' },
];

describe('a mode whose changes are proposals', () => {
  it('is drawn at its own level above the session\u2019s', () => {
    expect(levelInMode(PROPOSING, 'participate', 'suggesting')).toBe('edit');
    expect(levelInMode(PROPOSING, 'edit', 'suggesting')).toBe('edit');
  });

  it('is never drawn for a session it does not reach', () => {
    expect(levelInMode(PROPOSING, 'view', 'suggesting')).toBe('view');
    expect(proposalsInMode(PROPOSING, 'view', 'suggesting')).toBeNull();
  });

  it('names what runs above the session only while drawn above it', () => {
    const proposals = proposalsInMode(PROPOSING, 'participate', 'suggesting');
    expect(proposals?.below).toBe('participate');
    expect([...(proposals?.runs ?? [])]).toEqual(['bold', 'undo']);
    // An Editor is drawn at its own level: nothing to narrow.
    expect(proposalsInMode(PROPOSING, 'edit', 'suggesting')).toBeNull();
    // A mode that proposes nothing is never drawn above.
    expect(proposalsInMode(PROPOSING, 'participate', 'viewing')).toBeNull();
    expect(proposalsInMode(PDF_LIKE, 'participate', 'reviewing')).toBeNull();
  });
});
