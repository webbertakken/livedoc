// docs/specs/034-text-documents/lists.md "List styles", "Numbering".
import { describe, expect, it } from 'vitest';
import { ListDefinition, ListPresets, type ListDefinition as List } from '@livedoc/text-documents';
import {
  applyListPreset,
  continueNumbering,
  presetAt,
  restartAt,
  restartNumbering,
} from './text-document-list-options';
import { access, p, places, run, stateOf } from './text-document-lists.test-kit';

const preset = (id: string) => ListPresets.byId(id)!;
const N = () => ListDefinition.of('number');

describe('applyListPreset', () => {
  it('restyles the one list the selection is in, all its items, changing no paragraph', () => {
    const lists = access({ L1: N(), L2: N() });
    const state = stateOf(
      [
        p('a', { id: 'L1', level: 0 }),
        p('b', { id: 'L1', level: 1 }),
        p('c', { id: 'L2', level: 0 }),
      ],
      [0, 1],
    );
    const next = run(state, applyListPreset(lists, preset('numbered-outline')));
    expect(lists.added).toEqual([['L1', preset('numbered-outline').list]]);
    expect(next.doc.eq(state.doc)).toBe(true);
  });

  it('turns the list into another kind when the preset is of one', () => {
    const lists = access({ L1: N() });
    run(stateOf([p('a', { id: 'L1', level: 0 })]), applyListPreset(lists, preset('bulleted-star')));
    expect(lists.added).toEqual([['L1', preset('bulleted-star').list]]);
  });

  it('puts paragraphs in no list, or in two, in a new list of the preset, keeping their levels', () => {
    const lists = access({ L1: N(), L2: N() });
    const state = stateOf(
      [p('a', { id: 'L1', level: 2, checked: true }), p('b'), p('c', { id: 'L2', level: 1 })],
      [0, 2],
    );
    const next = run(state, applyListPreset(lists, preset('checklist-plain')));
    expect(lists.added).toEqual([['L3', preset('checklist-plain').list]]);
    expect(places(next)).toEqual([
      { id: 'L3', level: 2 },
      { id: 'L3', level: 0 },
      { id: 'L3', level: 1 },
    ]);
  });

  it('writes no list when only asked whether it can run', () => {
    const lists = access({});
    expect(applyListPreset(lists, preset('bulleted'))(stateOf([p('a')]))).toBe(true);
    expect(lists.added).toEqual([]);
  });
});

describe('presetAt', () => {
  it('names the preset of the list at the caret, none for a list of its own look or off a list', () => {
    const own: List = { levels: [{ kind: 'bullet', bullet: '♥' }] };
    const lists = { L1: preset('numbered-upper-roman').list, L2: own };
    expect(presetAt(stateOf([p('a', { id: 'L1', level: 3 })]), lists)?.id).toBe(
      'numbered-upper-roman',
    );
    expect(presetAt(stateOf([p('a', { id: 'L2', level: 0 })]), lists)).toBeNull();
    expect(presetAt(stateOf([p('a')]), lists)).toBeNull();
  });
});

describe('restartNumbering', () => {
  const lists = { L1: N(), B: ListDefinition.of('bullet') };

  it('restarts the first numbered item the selection touches, at its level, at the number', () => {
    const state = stateOf(
      [
        p('bullet', { id: 'B', level: 0 }),
        p('a', { id: 'L1', level: 1 }),
        p('b', { id: 'L1', level: 1 }),
      ],
      [0, 2],
    );
    expect(restartAt(state, lists)).toBe(1);
    const next = run(
      state,
      restartNumbering(() => lists, 7),
    );
    expect(places(next)).toEqual([
      { id: 'B', level: 0 },
      { id: 'L1', level: 1, restart: 7 },
      { id: 'L1', level: 1 },
    ]);
    expect(restartAt(next, lists)).toBe(7);
  });

  it('takes 0 to 32767 and nothing else', () => {
    const state = stateOf([p('a', { id: 'L1', level: 0 })]);
    expect(
      places(
        run(
          state,
          restartNumbering(() => lists, 0),
        ),
      ),
    ).toEqual([{ id: 'L1', level: 0, restart: 0 }]);
    run(
      state,
      restartNumbering(() => lists, 32767),
    );
    for (const n of [-1, 32768, 1.5, Number.NaN])
      run(
        state,
        restartNumbering(() => lists, n),
        false,
      );
  });

  it('declines off a numbered item: a bullet, a checklist, a further paragraph, no list', () => {
    const more = { ...lists, C: ListDefinition.of('check') };
    for (const place of [
      { id: 'B', level: 0 },
      { id: 'C', level: 0 },
      { id: 'L1', level: 0, unnumbered: true },
      null,
    ]) {
      const state = stateOf([p('a', place)]);
      expect(restartAt(state, more)).toBeNull();
      run(
        state,
        restartNumbering(() => more, 1),
        false,
      );
    }
  });
});

describe('continueNumbering', () => {
  const lists = { L1: N(), L2: N(), B: ListDefinition.of('bullet') };

  it('takes back a restart on the item', () => {
    const state = stateOf(
      [p('a', { id: 'L1', level: 0 }), p('b', { id: 'L1', level: 0, restart: 4 })],
      1,
    );
    expect(
      places(
        run(
          state,
          continueNumbering(() => lists),
        ),
      ),
    ).toEqual([
      { id: 'L1', level: 0 },
      { id: 'L1', level: 0 },
    ]);
  });

  it('joins the whole list to the numbered list before its first item, keeping levels', () => {
    const state = stateOf(
      [
        p('one', { id: 'L1', level: 0 }),
        p('bullet', { id: 'B', level: 0 }),
        p('plain'),
        p('two', { id: 'L2', level: 0 }),
        p('two a', { id: 'L2', level: 1 }),
        p('three', { id: 'L2', level: 0 }),
      ],
      4,
    );
    expect(
      places(
        run(
          state,
          continueNumbering(() => lists),
        ),
      ),
    ).toEqual([
      { id: 'L1', level: 0 },
      { id: 'B', level: 0 },
      null,
      { id: 'L1', level: 0 },
      { id: 'L1', level: 1 },
      { id: 'L1', level: 0 },
    ]);
  });

  it('declines on the first numbered list, off a numbered item, and with no list before', () => {
    run(
      stateOf([p('a', { id: 'L1', level: 0 }), p('b', { id: 'L1', level: 0 })], 1),
      continueNumbering(() => lists),
      false,
    );
    run(
      stateOf([p('bullet', { id: 'B', level: 0 })]),
      continueNumbering(() => lists),
      false,
    );
    run(
      stateOf([p('b', { id: 'B', level: 0 }), p('a', { id: 'L2', level: 0 })], 1),
      continueNumbering(() => lists),
      false,
    );
    run(
      stateOf([p('a')]),
      continueNumbering(() => lists),
      false,
    );
  });
});
