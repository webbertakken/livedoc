// docs/specs/034-text-documents/lists.md "List styles": Google's presets for each kind of list, their nine levels, and
// the preset a list matches.
import { describe, expect, it } from 'vitest';
import { ListMarkers } from './list-markers';
import { ListPresets, LIST_PRESETS } from './list-presets';
import { LIST_LEVELS, ListDefinition, type ListDefinition as List } from './lists';

const markersOf = (list: List, levels: number[]) =>
  ListMarkers.of(
    levels.map((level) => ({ id: 'L', level })),
    { L: list },
  ).map((m) => m?.text);

describe('ListPresets', () => {
  it('names each kind its presets in Google order, the default first', () => {
    expect(ListPresets.of('number').map((p) => p.name)).toEqual([
      '1. a. i.',
      '1) a) i)',
      '1. 1.1. 1.1.1.',
      'A. a. i.',
      'I. A. 1.',
    ]);
    expect(ListPresets.of('bullet').map((p) => p.name)).toEqual([
      '● ○ ■',
      '❖ ➢ ■',
      '➔ ○ ■',
      '✓ ○ ■',
      '★ ○ ■',
      '- ○ ■',
    ]);
    expect(ListPresets.of('check').map((p) => p.name)).toEqual([
      'With strikethrough',
      'Without strikethrough',
    ]);
    expect(new Set(LIST_PRESETS.map((p) => p.id)).size).toBe(LIST_PRESETS.length);
  });

  it('gives every preset nine levels, 0.5 in deeper each, of its own kind', () => {
    for (const preset of LIST_PRESETS) {
      expect(preset.list.levels).toHaveLength(LIST_LEVELS);
      expect(preset.list.levels.every((l) => l.kind === preset.kind)).toBe(true);
      expect(preset.list.levels.map((l) => l.indent)).toEqual(
        Array.from({ length: LIST_LEVELS }, (_, i) => 36 * (i + 1)),
      );
    }
  });

  it('makes the default presets the lists a toggle makes', () => {
    for (const kind of ['bullet', 'number', 'check'] as const)
      expect(ListPresets.of(kind)[0]!.list).toEqual(ListDefinition.of(kind));
  });

  it('draws each numbered preset as its name says, cycling down the levels', () => {
    const drawn = (id: string, levels: number[]) => markersOf(ListPresets.byId(id)!.list, levels);
    expect(drawn('numbered-parenthesis', [0, 1, 2, 3])).toEqual(['1)', 'a)', 'i)', '1)']);
    expect(drawn('numbered-outline', [0, 1, 2, 3])).toEqual(['1.', '1.1.', '1.1.1.', '1.1.1.1.']);
    expect(drawn('numbered-upper-letter', [0, 1, 2])).toEqual(['A.', 'a.', 'i.']);
    expect(drawn('numbered-upper-roman', [0, 1, 2, 3, 4, 5])).toEqual([
      'I.',
      'A.',
      '1.',
      'a.',
      'i.',
      'I.',
    ]);
    expect(drawn('bulleted-arrow', [0, 1, 2, 3])).toEqual(['➔', '○', '■', '➔']);
  });

  it('strikes ticked items through in a checklist unless it is the plain preset', () => {
    expect(ListPresets.byId('checklist-plain')!.list.levels[0]).toMatchObject({
      kind: 'check',
      strikeChecked: false,
    });
    expect(ListPresets.byId('checklist')!.list.levels[0]).not.toHaveProperty('strikeChecked');
  });

  it('finds the preset a list matches by its first three levels, else none', () => {
    const outline = ListPresets.byId('numbered-outline')!.list;
    expect(ListPresets.matching(outline)?.id).toBe('numbered-outline');
    // A deeper level of its own does not hide the preset.
    const deeper = { levels: outline.levels.map((l, i) => (i === 5 ? { ...l, start: 4 } : l)) };
    expect(ListPresets.matching(deeper)?.id).toBe('numbered-outline');
    // Indents are no part of a style's look in the grid.
    const moved = { levels: outline.levels.map((l) => ({ ...l, indent: 10 })) };
    expect(ListPresets.matching(moved)?.id).toBe('numbered-outline');
    const own = { levels: outline.levels.map((l, i) => (i === 1 ? { ...l, start: 3 } : l)) };
    expect(ListPresets.matching(own)).toBeNull();
    expect(ListPresets.matching(ListPresets.byId('checklist-plain')!.list)?.id).toBe(
      'checklist-plain',
    );
    expect(ListPresets.matching(undefined)).toBeNull();
    // A list of fewer levels than the grid draws looks like no preset.
    expect(ListPresets.matching({ levels: outline.levels.slice(0, 1) })).toBeNull();
    expect(ListPresets.byId('nothing')).toBeUndefined();
  });
});
