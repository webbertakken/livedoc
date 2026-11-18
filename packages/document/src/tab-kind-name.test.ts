import { describe, expect, it } from 'vitest';
import { ES_BOARD_LAYER_ID } from './event-storming';
import { TAB_KINDS } from './tab-kind';
import { tabKindLabel, tabKindName, tabKindNoun } from './tab-kind-name';

// A tab's kind is always findable (docs/specs/007-editor/editor-modes.md "A tab's kind is always findable").
describe('tabKindLabel', () => {
  it('names every kind as the interface shows it', () => {
    expect(TAB_KINDS.map(tabKindLabel)).toEqual([
      'Diagram',
      'Event Storming',
      'Board',
      'Sheet',
      'Dashboard',
      'Form',
      'Text document',
    ]);
  });
});

describe('tabKindName', () => {
  it('names a Plan kind on its own', () => {
    expect(tabKindName({ kind: 'board', opensIn: 'plan' })).toBe('Board tab');
    expect(tabKindName({ kind: 'form' })).toBe('Form tab');
    expect(tabKindName({ kind: 'text-document' })).toBe('Text document tab');
  });

  it('names an event-storming board, whose glyph is Structured, by its kind alone', () => {
    expect(tabKindName({ kind: 'event-storming' })).toBe('Event Storming tab');
  });

  it('recognises an event-storming board stored before tabs had a kind', () => {
    expect(tabKindName({ layers: [{ id: ES_BOARD_LAYER_ID, name: 'Board' }] })).toBe(
      'Event Storming tab',
    );
  });

  it('names a general tab with the mode its glyph shows', () => {
    expect(tabKindName({ kind: 'diagram', opensIn: 'draw' })).toBe('Diagram tab, in Sketch mode');
    expect(tabKindName({})).toBe('Diagram tab, in Structured mode');
    expect(tabKindName({ kind: 'diagram', opensIn: 'pages' })).toBe('Diagram tab, in Pages mode');
  });
});

describe('tabKindNoun', () => {
  it('names what the tab is, without its mode', () => {
    expect(tabKindNoun({ kind: 'diagram', opensIn: 'draw' })).toBe('Diagram tab');
    expect(tabKindNoun({ kind: 'dashboard' })).toBe('Dashboard tab');
    expect(tabKindNoun({ layers: [{ id: ES_BOARD_LAYER_ID, name: 'Board' }] })).toBe(
      'Event Storming tab',
    );
  });
});
