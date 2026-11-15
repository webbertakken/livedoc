import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import {
  ITEMS_SEARCH_KEY,
  SEARCH_TEXT_MAX_CHARS,
  SEARCH_TRIGRAMS_MAX,
  capSearchText,
  compileContentQuery,
  contentSearchStatements,
  searchContent,
  TRIGRAM_SEARCH,
  trimSnippet,
} from './content-search';

const NOW = 1_000_000;

function setup() {
  const { env, sql } = sqliteD1();
  const doc = (id: string, owner: string, extra = '') =>
    sql.exec(`INSERT INTO documents (id, owner_id, name, saved_at, created_at${extra ? ', ' + extra.split('=')[0] : ''})
      VALUES ('${id}', '${owner}', '${id}', ${NOW - id.length}, 1${extra ? ', ' + extra.split('=')[1] : ''})`);
  doc('mine', 'me');
  doc('mine-2', 'me');
  doc('theirs', 'other');
  doc('trashed', 'me', 'trashed_at=5');
  doc('team-doc', 'other', "team_id='t1'");
  doc('shared', 'other', 'shareable=1');
  doc('scoped', 'other', 'shareable=1');
  sql.exec(`
    INSERT INTO teams (id, name, created_at, updated_at) VALUES ('t1', 'T', 1, 1);
    INSERT INTO team_members (id, team_id, user_id, role, created_at, updated_at, status)
      VALUES ('m1', 't1', 'me', 'member', 1, 1, 'joined');
    INSERT INTO share_links (code, document_id, role, created_at) VALUES ('c1', 'shared', 'view', 1);
    INSERT INTO share_links (code, document_id, role, created_at, tab_id) VALUES ('c2', 'scoped', 'view', 1, 'tab-a');
    INSERT INTO shared_with (owner_id, document_id, role, last_seen) VALUES ('me', 'shared', 'view', 1);
    INSERT INTO shared_with (owner_id, document_id, role, last_seen, tab_id) VALUES ('me', 'scoped', 'view', 1, 'tab-a');
  `);
  const index = async (documentId: string, tabId: string, text: string | null, tabName = tabId) => {
    for (const s of contentSearchStatements(env, documentId, tabId, tabName, text)) await s.run();
  };
  const search = (q: string, owner = 'me') => searchContent(env, owner, q, NOW);
  return { env, sql, index, search };
}

const ids = (m: { documentId: string }[]) => m.map((x) => x.documentId);

describe('compileContentQuery', () => {
  it('splits trigram words from short words, deduplicating trigrams', () => {
    const q = compileContentQuery('Café ab banana');
    expect(q.long.map((w) => w.word)).toEqual(['cafe', 'banana']);
    expect(q.long[1]!.trigrams).toEqual(['ban', 'ana', 'nan']);
    expect(q.short).toEqual(['ab']);
  });

  it('caps the trigrams', () => {
    expect(compileContentQuery('abcdefghijklmnopqrstuvwxyz0123456789zyxwv').trigrams).toHaveLength(
      SEARCH_TRIGRAMS_MAX,
    );
  });

  it('finds no words in punctuation', () => {
    expect(compileContentQuery(' — !? ')).toEqual({ long: [], short: [], trigrams: [] });
  });
});

describe('searchContent', () => {
  it('finds a substring, folding case and accents', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'Notes from the Café retrospective');
    expect(ids(await search('cafe'))).toEqual(['mine']);
    expect(ids(await search('RETRO'))).toEqual(['mine']);
  });

  it('forgives a typo, and ranks the exact word first', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'the retrospective notes');
    await index('mine-2', 'tab-1', 'the retrospectve notes');
    const found = await search('retrospective');
    expect(ids(found)).toEqual(['mine', 'mine-2']);
  });

  it('needs every word in one tab', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'kanban board');
    await index('mine', 'tab-2', 'sprint planning');
    expect(await search('kanban sprint')).toEqual([]);
    expect(ids(await search('kanban board'))).toEqual(['mine']);
  });

  it('drops a document that shares only stray trigrams', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'retail banana');
    expect(await search('retrospective')).toEqual([]);
  });

  it('matches short words by word start, alone or with long words', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'Q3 plan for the launch');
    await index('mine-2', 'tab-1', 'unq3 launch');
    expect(ids(await search('q3'))).toEqual(['mine']);
    expect(ids(await search('q3 launch'))).toEqual(['mine']);
  });

  it('answers only documents the reader may open', async () => {
    const { index, search } = setup();
    for (const d of ['mine', 'theirs', 'trashed', 'team-doc', 'shared'])
      await index(d, 'tab-1', 'zebra stripes');
    expect(ids(await search('zebra')).sort()).toEqual(['mine', 'shared', 'team-doc']);
  });

  it('keeps a tab-scoped reader to their tab, and never their cards', async () => {
    const { index, search } = setup();
    await index('scoped', 'tab-a', 'giraffe in tab a');
    await index('scoped', 'tab-b', 'okapi in tab b');
    await index('scoped', ITEMS_SEARCH_KEY, 'okapi card', '');
    expect(ids(await search('giraffe'))).toEqual(['scoped']);
    expect(await search('okapi')).toEqual([]);
  });

  it('answers one match per document, naming the tab, and none for cards', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'walrus', 'First');
    await index('mine', 'tab-2', 'walrus walrus', 'Second');
    await index('mine-2', ITEMS_SEARCH_KEY, 'walrus card', '');
    const found = await search('walrus');
    expect(found).toHaveLength(2);
    expect(found.find((m) => m.documentId === 'mine-2')).toMatchObject({
      tabId: null,
      tabName: null,
    });
    expect(found.find((m) => m.documentId === 'mine')!.tabName).toMatch(/First|Second/);
  });

  it('marks the match in the snippet', async () => {
    const { index, search } = setup();
    await index('mine', 'tab-1', 'Some text about pelicans and more');
    const [m] = await search('pelican');
    const { text, marks } = m!.snippet;
    expect(marks.length).toBeGreaterThan(0);
    expect(text.slice(marks[0]![0], marks[0]![1]).toLowerCase()).toContain('pelican');
  });

  it('forgets a tab whose text goes, and a purged document', async () => {
    const { sql, index, search } = setup();
    await index('mine', 'tab-1', 'narwhal');
    await index('mine', 'tab-1', null);
    expect(await search('narwhal')).toEqual([]);
    await index('mine-2', 'tab-1', 'narwhal');
    sql.exec("DELETE FROM documents WHERE id = 'mine-2'");
    expect(await search('narwhal')).toEqual([]);
    expect(
      sql
        .prepare(
          "SELECT count(*) AS n FROM content_search_fts WHERE content_search_fts MATCH 'narwhal'",
        )
        .get(),
    ).toEqual({ n: 0 });
  });

  it('writes nothing for a document that is gone', async () => {
    const { sql, index } = setup();
    await index('nowhere', 'tab-1', 'ghost');
    expect(sql.prepare('SELECT count(*) AS n FROM content_search').get()).toEqual({ n: 0 });
  });
});

describe('snippets', () => {
  it('cuts a long line around the first mark at word boundaries', () => {
    const text = `${'lorem ipsum '.repeat(30)}TARGET ${'dolor sit '.repeat(30)}`;
    const at = text.indexOf('TARGET');
    const cut = trimSnippet({ text, marks: [[at, at + 6]] });
    expect(cut.text.length).toBeLessThanOrEqual(162);
    expect(cut.text.startsWith('…')).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text.slice(cut.marks[0]![0], cut.marks[0]![1])).toBe('TARGET');
  });
});

describe('capSearchText', () => {
  it('cuts at the cap without splitting a surrogate pair', () => {
    const text = 'a'.repeat(SEARCH_TEXT_MAX_CHARS - 1) + '😀b';
    const cut = capSearchText(text);
    expect(cut.capped).toBe(true);
    expect(cut.text).toHaveLength(SEARCH_TEXT_MAX_CHARS - 1);
  });
});

// Up to SEARCH_CANDIDATES candidates are ranked and filtered, each tab's text up to SEARCH_TEXT_MAX_CHARS: the
// text rides along only for the matches the search answers, read by key at the end
// (docs/specs/016-platform/web-performance.md "The api").
describe('the search query', () => {
  it('ranks candidates without their text and reads it for the answered matches only', () => {
    const candidates = TRIGRAM_SEARCH.slice(
      TRIGRAM_SEARCH.indexOf('hits AS ('),
      TRIGRAM_SEARCH.indexOf('kept AS ('),
    );
    expect(candidates).not.toMatch(/\bs\.text\b/);
    expect(TRIGRAM_SEARCH).toMatch(/JOIN content_search cs ON cs\.rowid = r\.search_rowid/);
  });
});
