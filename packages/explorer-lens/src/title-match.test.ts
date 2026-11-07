import { describe, expect, it } from 'vitest';
import { cpuBudgetMs, cpuMsOf } from '@livedoc/vitest-config/cpu-time';
import {
  compileTitleQuery,
  matchTitle,
  rankByTitle,
  scoreTitle,
  type TitleRange,
} from './title-match';

// A regression guard, not the product budget: the frame budget is measured in Chromium . Ranking 10,000
// titles settles at 1 to 5 ms on a developer's machine; 40 leaves room for the
// coverage run on CI (30 to 60 ms there, against cpuBudgetMs's 120) and still fails a quadratic slide.
const TITLE_BUDGET_COUNT = 10_000;
const TITLE_BUDGET_MS = 40;
// CPU time also counts the optimising compiler, which runs beside the first rounds; a page compiles off its
// main thread, so the budget is the settled cost.
const WARM_ROUNDS = 10;
const MEASURED_ROUNDS = 5;

const query = (input: string) => compileTitleQuery(input.split(' '));
const score = (input: string, title: string) => scoreTitle(query(input), title);
const ranges = (input: string, title: string) => matchTitle(query(input), title)?.ranges ?? null;
/** The matched characters, as the highlight would mark them. */
const marked = (input: string, title: string) =>
  (ranges(input, title) ?? []).map(({ start, end }: TitleRange) => title.slice(start, end));

describe('compileTitleQuery', () => {
  it('folds each word and splits it where a character is no letter or digit', () => {
    expect(query('Café Q3-plan  ').words.map((word) => word.text)).toEqual(['cafe', 'q3', 'plan']);
  });

  it('gives a word its typos by length', () => {
    expect(query('abc abcd abcdefg abcdefgh').words.map((word) => word.typos)).toEqual([
      0, 1, 1, 2,
    ]);
  });
});

describe('scoreTitle', () => {
  it('scores every title 0 for a query with no words', () => {
    expect(score('', 'Anything')).toBe(0);
    expect(scoreTitle(compileTitleQuery(['--']), 'Anything')).toBe(0);
  });

  it('ignores case and accents', () => {
    expect(score('CAFE', 'Café')).toBe(0);
    expect(score('café', 'CAFE')).toBe(0);
  });

  it('needs every word to match', () => {
    expect(score('meeting kanban', 'Meeting notes')).toBeNull();
  });

  it('adds the words’ scores', () => {
    expect(score('meeting nts', 'Meeting notes')).toBe(2.5);
  });

  describe('substring tier', () => {
    it('scores a word at a title word’s start 0', () => {
      expect(score('notes', 'Meeting notes')).toBe(0);
      expect(score('ting no', 'Meeting notes')).toBe(0.5);
    });

    it('scores a word inside a title word 0.5', () => {
      expect(score('eti', 'Meeting notes')).toBe(0.5);
    });

    it('prefers a later word start to an earlier inner match', () => {
      expect(marked('note', 'Keynote notebook')).toEqual(['note']);
      expect(ranges('note', 'Keynote notebook')).toEqual([{ start: 8, end: 12 }]);
    });
  });

  describe('word-prefixes tier', () => {
    it('scores a word spelled by the starts of successive title words 1', () => {
      expect(score('meetnot', 'Meeting notes')).toBe(1);
      expect(marked('meetnot', 'Meeting notes')).toEqual(['Meet', 'not']);
    });

    it('may skip title words', () => {
      expect(score('sprev', 'Sprint planning review')).toBe(1);
      expect(marked('sprev', 'Sprint planning review')).toEqual(['Sp', 'rev']);
    });

    it('backs off a long start to spell the rest', () => {
      expect(marked('stastand', 'Stand standup')).toEqual(['Sta', 'stand']);
    });

    it('needs at least two letters from each title word', () => {
      expect(score('meetn', 'Meeting notes')).not.toBe(1);
    });

    it('skips title words too short to give a start, and one-letter words', () => {
      expect(score('xbo', 'x board')).toBeNull();
      expect(score('z', 'Meeting notes')).toBeNull();
    });

    it('gives up on a spelling that dead-ends, once', () => {
      expect(score('aaaaaaaaab', 'aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa')).toBeNull();
    });
  });

  describe('subsequence tier', () => {
    it('scores the initials of successive title words 2', () => {
      expect(score('mn', 'Meeting notes')).toBe(2);
      expect(marked('mn', 'Meeting notes')).toEqual(['M', 'n']);
      expect(marked('mn', 'Meeting notes now')).toEqual(['M', 'n']);
    });

    it('scores letters in order within one title word, from its first letter, 2.5', () => {
      expect(score('mtg', 'Meeting notes')).toBe(2.5);
      expect(score('mtg nts', 'Meeting notes')).toBe(5);
      expect(marked('mtg', 'Meeting notes')).toEqual(['M', 't', 'g']);
    });

    it('never starts inside a title word or runs across two', () => {
      expect(score('tng', 'Meeting notes')).toBeNull();
      expect(score('mgn', 'Meeting notes')).toBeNull();
    });
  });

  describe('typo tier', () => {
    it('forgives one typo from four letters', () => {
      expect(score('notse', 'Meeting notes')).toBe(3);
      expect(score('meetnig', 'Meeting notes')).toBe(3);
      expect(score('meetimg', 'Meeting notes')).toBe(3);
      expect(score('meeeting', 'Meeting notes')).toBe(3);
      expect(score('neeting', 'Meeting notes')).toBe(3);
    });

    it('forgives none under four letters', () => {
      expect(score('nte', 'Kanban')).toBeNull();
      expect(score('xot', 'Meeting notes')).toBeNull();
    });

    it('forgives two typos from eight letters, scored 3.5', () => {
      expect(score('retrospectvie', 'Sprint retrospective')).toBe(3);
      expect(score('retorspectvie', 'Sprint retrospective')).toBe(3.5);
      expect(score('mettnig', 'Meeting notes')).toBeNull();
    });

    it('matches a word still being typed against the start of a title word', () => {
      expect(score('retrx', 'Sprint retrospective')).toBe(3);
      expect(marked('retrx', 'Sprint retrospective')).toEqual(['retro']);
    });

    it('prefers the title word with fewer typos', () => {
      expect(marked('architectrue', 'Archtiecutre architecture')).toEqual(['architecture']);
    });

    it('prefers the earliest title word between equals', () => {
      expect(ranges('notse', 'Notes notes')).toEqual([{ start: 0, end: 5 }]);
    });

    it('skips a title word too short to hold the word', () => {
      expect(score('planning', 'Plan')).toBeNull();
    });

    it('skips a title word lacking too many of the word’s letters', () => {
      expect(score('kanban', 'Meeting notes')).toBeNull();
    });

    it('reads no more than the start of a very long title word', () => {
      const long = `${'a'.repeat(100)}`;
      expect(score('aaaab', long)).toBe(3);
    });
  });
});

describe('matchTitle', () => {
  it('returns the score with the matched characters', () => {
    expect(matchTitle(query('meet'), 'Meeting notes')).toEqual({
      score: 0,
      ranges: [{ start: 0, end: 4 }],
    });
  });

  it('returns null when a word misses', () => {
    expect(matchTitle(query('zebra'), 'Meeting notes')).toBeNull();
  });

  it('merges ranges that touch or overlap, in order', () => {
    expect(ranges('ting meet', 'Meeting notes')).toEqual([{ start: 0, end: 7 }]);
    expect(ranges('notes meet', 'Meeting notes')).toEqual([
      { start: 0, end: 4 },
      { start: 8, end: 13 },
    ]);
  });

  it('maps ranges back through accents and letters that fold longer', () => {
    expect(marked('cafe', 'Le Café')).toEqual(['Café']);
    expect(marked('creme', 'Crème brûlée')).toEqual(['Crème']);
    expect(marked('brul', 'Crème brûlée')).toEqual(['brûl']);
    expect(marked('i', 'İzmir')).toEqual(['İ']);
    expect(marked('zmir', 'İzmir')).toEqual(['zmir']);
  });

  it('maps ranges back past combining marks typed on their own', () => {
    const title = 'Cafe\u0301 au lait';
    expect(marked('cafe', title)).toEqual(['Cafe\u0301']);
    expect(marked('lait', title)).toEqual(['lait']);
  });

  it('maps ranges back past characters outside the basic plane', () => {
    expect(marked('plan', '🚀 Launch plan')).toEqual(['plan']);
  });

  it('highlights nothing for a query with no words', () => {
    expect(matchTitle(query(''), 'Anything')).toEqual({ score: 0, ranges: [] });
  });
});

describe('rankByTitle', () => {
  const titles = [
    'Sprint retrospectvie',
    'Kanban',
    'Retro board',
    'Q3 retrospective',
    'Retrospective notes',
  ];

  it('keeps the matches, best first, ties in their own order', () => {
    expect(rankByTitle(titles, query('retrospective'), (title) => title)).toEqual([
      'Q3 retrospective',
      'Retrospective notes',
      'Sprint retrospectvie',
    ]);
  });

  it('keeps every item in its own order for a query with no words', () => {
    expect(rankByTitle(titles, query(''), (title) => title)).toEqual(titles);
  });
});

describe('the frame budget', () => {
  // 10,000 titles of two to five words from a working vocabulary, a third with accents or a year
  // (docs/specs/013-workspace/explorer-filters.md).
  const VOCABULARY = [
    'meeting',
    'notes',
    'retrospective',
    'sprint',
    'planning',
    'roadmap',
    'quarterly',
    'review',
    'architecture',
    'diagram',
    'onboarding',
    'checklist',
    'customer',
    'journey',
    'event',
    'storming',
    'kanban',
    'board',
    'design',
    'system',
    'café',
    'résumé',
    'brainstorm',
    'launch',
    'budget',
    'forecast',
    'incident',
    'postmortem',
    'gateway',
    'database',
    'schema',
    'marketing',
    'hiring',
    'offsite',
    'strategy',
    'weekly',
    'standup',
    'release',
    'research',
    'interview',
    'synthesis',
  ];
  let seed = 42;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const titles = Array.from({ length: TITLE_BUDGET_COUNT }, (_, i) => {
    const words = Array.from(
      { length: 2 + Math.floor(random() * 4) },
      () => VOCABULARY[Math.floor(random() * VOCABULARY.length)]!,
    );
    return `${words.join(' ')}${random() < 0.3 ? ` ${2020 + (i % 7)}` : ''}`;
  });

  it.each(['meeting', 'mtg nts', 'retrospectvie', 'meetnot', 'sprint planning review', 'xyzzy'])(
    'ranks 10,000 titles for “%s” without a quadratic slide',
    (input) => {
      // Some keystrokes in, as the field sees them: the titles folded and the matcher compiled.
      for (let round = 0; round < WARM_ROUNDS; round++)
        rankByTitle(titles, query(input), (title) => title);
      // The median of a few keystrokes: one alone may carry a collection or a compile.
      const spent = Array.from({ length: MEASURED_ROUNDS }, () =>
        cpuMsOf(() => rankByTitle(titles, query(input), (title) => title)),
      ).sort((a, b) => a - b);
      expect(spent[MEASURED_ROUNDS >> 1]).toBeLessThan(cpuBudgetMs(TITLE_BUDGET_MS));
    },
  );
});
