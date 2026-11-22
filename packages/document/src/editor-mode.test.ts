import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_MODE,
  EDITOR_MODE_CATALOGUE,
  EDITOR_MODES,
  SWITCHABLE_EDITOR_MODES,
  editorModeLabel,
  setTabOpensIn,
  editorModeSwitchable,
  tabModeWritable,
  hasBoardLook,
  hasPageLook,
  hasPlanInput,
  isEditorMode,
  nextEditorMode,
  opensInOf,
  parseEditorMode,
  isLegacyWorkshopOpensIn,
  setTabWorkshop,
  workshopOf,
} from './editor-mode';
import type { Tab } from './index';

// Editor modes (docs/specs/007-editor/editor-modes.md): how a general tab is worked on.
describe('editor modes', () => {
  it('are Sketch, Structured, Pages and Plan (never switched to), Structured by default', () => {
    expect(EDITOR_MODES).toEqual(['draw', 'diagram', 'pages', 'plan']);
    expect(DEFAULT_EDITOR_MODE).toBe('diagram');
  });

  it('recognises a mode and nothing else', () => {
    expect(isEditorMode('diagram')).toBe(true);
    expect(isEditorMode('draw')).toBe(true);
    expect(isEditorMode('pages')).toBe(true);
    expect(isEditorMode('plan')).toBe(true);
    expect(isEditorMode('workshop')).toBe(false);
    expect(isEditorMode('whiteboard')).toBe(false);
    expect(isEditorMode(undefined)).toBe(false);
    expect(isEditorMode(1)).toBe(false);
    expect(isEditorMode('Diagram')).toBe(false);
    expect(isEditorMode('')).toBe(false);
    expect(isEditorMode(null)).toBe(false);
  });
});

describe('opensInOf', () => {
  it('reads a tab without an opening mode as Diagram', () => {
    expect(opensInOf({})).toBe('diagram');
    expect(opensInOf(undefined)).toBe('diagram');
  });

  it('reads a tab that opens in Draw', () => {
    expect(opensInOf({ opensIn: 'draw' })).toBe('draw');
    expect(opensInOf({ kind: 'diagram', opensIn: 'draw' })).toBe('draw');
  });

  // docs/specs/007-editor/editor-modes.md "Naming in the interface": Pages was Illustrate, and Infographic.
  it('reads either old name of Pages mode as Pages', () => {
    expect(opensInOf({ opensIn: 'illustrate' })).toBe('pages');
    expect(opensInOf({ opensIn: 'infographic' })).toBe('pages');
    expect(parseEditorMode('illustrate')).toBe('pages');
    expect(parseEditorMode('Illustrate')).toBeUndefined();
  });

  // docs/specs/007-editor/editor-modes.md "Stored modes that are no longer modes": Workshop (and Facilitate before it)
  // reads as Structured, with the Workshop control on.
  it('reads Workshop mode, by either name, as Structured', () => {
    expect(opensInOf({ opensIn: 'workshop' })).toBe('diagram');
    expect(opensInOf({ opensIn: 'facilitate' })).toBe('diagram');
    expect(parseEditorMode('workshop')).toBe('diagram');
    expect(parseEditorMode('facilitate')).toBe('diagram');
  });

  it('reads an unknown opening mode as Diagram', () => {
    expect(opensInOf({ opensIn: 'sketch' })).toBe('diagram');
  });

  it('opens an event-storming board in Diagram whatever it stores', () => {
    expect(opensInOf({ kind: 'event-storming', opensIn: 'draw' })).toBe('diagram');
    const legacy = { opensIn: 'draw', layers: [{ id: 'layer:es:board', name: 'Event Storming' }] };
    expect(opensInOf(legacy)).toBe('diagram');
  });
});

describe('editorModeSwitchable', () => {
  it('never on a Plan tab: a Plan kind, or a general tab stored in Plan', () => {
    for (const kind of ['board', 'sheet', 'dashboard', 'form'] as const)
      expect(editorModeSwitchable({ kind })).toBe(false);
    expect(editorModeSwitchable({ kind: 'diagram', opensIn: 'plan' })).toBe(false);
  });

  it('lets a template write the mode of the Plan start, never of a Plan kind', () => {
    expect(tabModeWritable({ opensIn: 'plan' })).toBe(true);
    expect(tabModeWritable({ kind: 'board' })).toBe(false);
    expect(tabModeWritable({ kind: 'event-storming' })).toBe(false);
  });

  // docs/specs/034-text-documents/text-document.md "What it holds": a text document has no editor mode.
  it('never writes a mode onto a text document, nor offers the switch', () => {
    expect(tabModeWritable({ kind: 'text-document' })).toBe(false);
    expect(tabModeWritable({ kind: 'pdf' })).toBe(false);
    expect(editorModeSwitchable({ kind: 'text-document', opensIn: 'draw' })).toBe(false);
  });

  it('offers the switch on a general tab', () => {
    expect(editorModeSwitchable({})).toBe(true);
    expect(editorModeSwitchable({ kind: 'diagram', opensIn: 'draw' })).toBe(true);
  });

  it('never on an event-storming board, new or legacy', () => {
    expect(editorModeSwitchable({ kind: 'event-storming' })).toBe(false);
    expect(editorModeSwitchable({ layers: [{ id: 'layer:es:board', name: 'ES' }] })).toBe(false);
  });
});

describe('hasBoardLook', () => {
  it('gives Draw mode the board look and Diagram mode none', () => {
    expect(hasBoardLook('draw')).toBe(true);
    expect(hasBoardLook('diagram')).toBe(false);
  });
});

// One catalogue (docs/specs/007-editor/editor-modes.md "Opens in"): a further mode is one entry.
describe('the editor mode catalogue', () => {
  it('lists every mode once, in order, with the words the interface shows', () => {
    expect(EDITOR_MODE_CATALOGUE.map((m) => m.id)).toEqual(EDITOR_MODES);
    expect(EDITOR_MODES.map(editorModeLabel)).toEqual(['Sketch', 'Structured', 'Pages', 'Plan']);
  });

  it('offers Sketch, Structured and Pages to switch between, in that order', () => {
    expect(SWITCHABLE_EDITOR_MODES).toEqual(['draw', 'diagram', 'pages']);
  });
});

describe('setTabOpensIn', () => {
  const general: Tab = { id: 't', name: 'T', elements: [] };

  it('sets the mode a tab opens in', () => {
    expect(setTabOpensIn(general, 'draw').opensIn).toBe('draw');
    expect(setTabOpensIn({ ...general, opensIn: 'draw' as const }, 'diagram').opensIn).toBe(
      'diagram',
    );
  });

  it('returns the same tab when nothing changes', () => {
    const draw = { ...general, opensIn: 'draw' as const };
    expect(setTabOpensIn(draw, 'draw')).toBe(draw);
    expect(setTabOpensIn(general, 'diagram')).toBe(general);
  });

  it('never gives an event-storming board an opening mode', () => {
    const es = { ...general, kind: 'event-storming' as const };
    expect(setTabOpensIn(es, 'draw')).toBe(es);
  });
});

// Shift+D walks the three switchable modes (docs/specs/007-editor/editor-modes.md "The mode switch").
describe('nextEditorMode', () => {
  it('moves forward through Sketch, Structured and Pages, wrapping at the end', () => {
    expect(nextEditorMode('draw')).toBe('diagram');
    expect(nextEditorMode('diagram')).toBe('pages');
    expect(nextEditorMode('pages')).toBe('draw');
  });

  it('moves backward with a negative step, wrapping at the start', () => {
    expect(nextEditorMode('draw', -1)).toBe('pages');
    expect(nextEditorMode('pages', -1)).toBe('diagram');
    expect(nextEditorMode('diagram', -1)).toBe('draw');
  });

  it('never steps into Plan, and from Plan steps to an end of the three', () => {
    expect(nextEditorMode('plan')).toBe('draw');
    expect(nextEditorMode('plan', -1)).toBe('pages');
  });
});

// Pages mode's page (docs/specs/007-editor/editor-modes.md "The pages").
describe('hasPageLook', () => {
  it('draws the page in Pages mode only', () => {
    expect(EDITOR_MODES.filter(hasPageLook)).toEqual(['pages']);
    // Plan mode (docs/specs/026-plan/plan-mode.md) takes input the Plan way; nothing else does.
    expect(EDITOR_MODES.filter(hasPlanInput)).toEqual(['plan']);
  });
});

// docs/specs/012-collaboration/workshop-mode.md: the Workshop control is the tab's, independent of its mode.
describe('workshopOf', () => {
  it('is off unless the tab says so', () => {
    expect(workshopOf({})).toBe(false);
    expect(workshopOf({ workshop: true })).toBe(true);
    expect(workshopOf({ workshop: 'yes' })).toBe(false);
    expect(workshopOf(undefined)).toBe(false);
  });

  it('is on for a tab stored in Workshop mode, by either name', () => {
    expect(workshopOf({ opensIn: 'workshop' })).toBe(true);
    expect(workshopOf({ opensIn: 'facilitate' })).toBe(true);
    expect(isLegacyWorkshopOpensIn('workshop')).toBe(true);
    expect(isLegacyWorkshopOpensIn('diagram')).toBe(false);
  });

  it('is on in any of the three modes', () => {
    for (const opensIn of ['draw', 'diagram', 'pages'] as const)
      expect(workshopOf({ opensIn, workshop: true })).toBe(true);
  });

  it('is never on for an event-storming board or a Plan tab', () => {
    expect(workshopOf({ kind: 'event-storming', workshop: true })).toBe(false);
    expect(workshopOf({ kind: 'board', workshop: true })).toBe(false);
    expect(workshopOf({ opensIn: 'plan', workshop: true })).toBe(false);
  });
});

describe('setTabWorkshop', () => {
  const general: Tab = { id: 't', name: 'T', elements: [] };

  it('turns it on and off, leaving the mode alone', () => {
    const on = setTabWorkshop({ ...general, opensIn: 'pages' }, true);
    expect(on).toMatchObject({ opensIn: 'pages', workshop: true });
    const off = setTabWorkshop(on, false);
    expect(off.opensIn).toBe('pages');
    expect('workshop' in off).toBe(false);
  });

  it('returns the same tab when nothing changes', () => {
    expect(setTabWorkshop(general, false)).toBe(general);
    const on = { ...general, workshop: true as const };
    expect(setTabWorkshop(on, true)).toBe(on);
  });

  it('writes a legacy Workshop-mode tab as it now is: Structured, the control as asked', () => {
    const legacy = { ...general, opensIn: 'workshop' } as unknown as Tab;
    const off = setTabWorkshop(legacy, false);
    expect(off.opensIn).toBeUndefined();
    expect(workshopOf(off)).toBe(false);
  });

  it('never on an event-storming board or a Plan tab', () => {
    const es = { ...general, kind: 'event-storming' as const };
    expect(setTabWorkshop(es, true)).toBe(es);
    const start = { ...general, opensIn: 'plan' as const };
    expect(setTabWorkshop(start, true)).toBe(start);
  });

  it('keeps the control across a mode switch, and writes it on for a legacy Workshop-mode tab', () => {
    const on = { ...general, workshop: true as const };
    expect(setTabOpensIn(on, 'draw')).toMatchObject({ opensIn: 'draw', workshop: true });
    const legacy = { ...general, opensIn: 'workshop' } as unknown as Tab;
    expect(setTabOpensIn(legacy, 'pages')).toMatchObject({ opensIn: 'pages', workshop: true });
  });
});
