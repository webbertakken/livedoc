// docs/specs/034-text-documents/review.md "Reactions": chips in order (the quick six first, then by characters), one's
// own marked, each naming its people ("You" first, others by name, else "Someone").
import { describe, expect, it } from 'vitest';
import { QUICK_REACTIONS, reactionChips, reactorNames } from './comment-reactions';

describe('reactionChips', () => {
  const names = new Map([
    ['ada', 'Ada'],
    ['bo', 'Bo'],
  ]);

  it('orders the quick six first, then the others by their characters', () => {
    const chips = reactionChips(
      { '🙂': ['ada'], '🎉': ['bo'], '👍': ['ada'], '🍕': ['ada'] },
      '',
      names,
    );
    expect(chips.map((c) => c.emoji)).toEqual(['👍', '🎉', '🍕', '🙂']);
    expect(QUICK_REACTIONS).toEqual(['👍', '❤️', '😂', '😮', '😢', '🎉']);
  });

  it('counts each, marks one’s own and names the people, you first', () => {
    const [chip] = reactionChips({ '👍': ['ada', 'bo', 'me', 'zz'] }, 'me', names);
    expect(chip).toEqual({
      emoji: '👍',
      count: 4,
      mine: true,
      label: 'You, Ada, Bo and Someone reacted with 👍',
    });
    expect(reactionChips({ '👍': ['ada'] }, 'me', names)[0]).toMatchObject({
      mine: false,
      label: 'Ada reacted with 👍',
    });
    expect(reactionChips({ '👍': ['me', 'bo'] }, 'me', names)[0]!.label).toBe(
      'You and Bo reacted with 👍',
    );
  });

  it('draws none for none', () => {
    expect(reactionChips(undefined, 'me', names)).toEqual([]);
  });
});

describe('reactorNames', () => {
  it('names each key by its latest comment', () => {
    const names = reactorNames([
      { authorId: 'ada', authorName: 'Ada L', createdAt: 1 },
      { authorId: 'ada', authorName: 'Ada', createdAt: 2 },
      { authorName: 'File', createdAt: 3 },
    ]);
    expect([...names]).toEqual([['ada', 'Ada']]);
  });
});
