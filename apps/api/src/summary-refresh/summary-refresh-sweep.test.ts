import { describe, expect, it } from 'vitest';
import type { ContentSummary } from '../db/content-summary';
import { sqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import {
  SUMMARY_REFRESH_BATCH,
  SUMMARY_REFRESH_RETRY_MS,
  sweepSummaryRefresh,
} from './summary-refresh-sweep';

// docs/specs/006-document/document-storage.md "Refreshing the summaries": off unless SUMMARY_REFRESH is `dry` or
// `run`; `dry` compares each room's summary with D1's and writes flags only; `run` writes a changed summary only if
// D1's is still the one compared, keeping the saved time; at most SUMMARY_REFRESH_BATCH a run, oldest first; a
// failure named and tried again after an hour; a second pass changes nothing more.

const NOW = 1_700_000_000_000;
const older: ContentSummary = {
  v: 1,
  tabs: 1,
  firstTabCount: 4,
  tabCounts: { t: 4 },
  stats: null,
  hasContent: true,
};
const fresh: ContentSummary = { ...older, textDocument: true };

function setup(mode: string | undefined, answer: (id: string) => Promise<ContentSummary>) {
  const d1 = sqliteD1({}, { keepD1Content: true });
  const asked: string[] = [];
  const env = {
    ...d1.env,
    SUMMARY_REFRESH: mode,
    DOCUMENT_ROOM: {
      idFromName: (id: string) => id,
      get: (id: string) => ({
        contentSummary: async () => {
          asked.push(id);
          return answer(id);
        },
      }),
    },
  } as unknown as Env;
  const add = (id: string, createdAt: number, summary: ContentSummary | null = older) =>
    d1.sql
      .prepare(
        'INSERT INTO documents (id, owner_id, name, saved_at, created_at, content_summary) VALUES (?, ?, ?, 7, ?, ?)',
      )
      .run(id, 'o', `Doc ${id}`, createdAt, summary ? JSON.stringify(summary) : null);
  const rows = () =>
    d1.sql.prepare('SELECT * FROM summary_refreshes ORDER BY document_id').all() as Record<
      string,
      unknown
    >[];
  const stored = (id: string) =>
    d1.sql.prepare('SELECT content_summary, saved_at FROM documents WHERE id = ?').get(id) as {
      content_summary: string | null;
      saved_at: number;
    };
  return { env, asked, add, rows, stored, sql: d1.sql };
}

describe('sweepSummaryRefresh', () => {
  it.each([[undefined], ['off'], ['restore']])(
    'asks no room while the switch is %s',
    async (mode) => {
      const s = setup(mode, async () => fresh);
      s.add('a', 1);
      expect(await sweepSummaryRefresh(s.env, NOW)).toEqual({
        found: 0,
        checked: 0,
        written: 0,
        failed: 0,
      });
      expect(s.asked).toEqual([]);
      expect(s.rows()).toEqual([]);
    },
  );

  it('counts in a dry run, oldest first, and never writes a summary', async () => {
    const s = setup('dry', async (id) => (id === 'b' ? older : fresh));
    s.add('b', 2);
    s.add('a', 1);
    s.add('c', 3, null);
    expect(await sweepSummaryRefresh(s.env, NOW)).toEqual({
      found: 3,
      checked: 3,
      written: 0,
      failed: 0,
    });
    expect(s.asked).toEqual(['a', 'b', 'c']);
    expect(s.rows()).toEqual([
      {
        document_id: 'a',
        changed: 1,
        gains_text_document: 1,
        checked_at: NOW,
        written_at: null,
        error: null,
      },
      {
        document_id: 'b',
        changed: 0,
        gains_text_document: 0,
        checked_at: NOW,
        written_at: null,
        error: null,
      },
      {
        document_id: 'c',
        changed: 1,
        gains_text_document: 1,
        checked_at: NOW,
        written_at: null,
        error: null,
      },
    ]);
    expect(s.stored('a').content_summary).toBe(JSON.stringify(older));
    expect(s.stored('c').content_summary).toBeNull();
    expect((await sweepSummaryRefresh(s.env, NOW + 1)).found).toBe(0);
  });

  it('writes a changed summary in a run, keeping the saved time, and is done after one pass', async () => {
    const s = setup('run', async () => fresh);
    s.add('a', 1);
    expect(await sweepSummaryRefresh(s.env, NOW)).toEqual({
      found: 1,
      checked: 1,
      written: 1,
      failed: 0,
    });
    expect(s.stored('a')).toEqual({ content_summary: JSON.stringify(fresh), saved_at: 7 });
    expect(s.rows()[0]).toMatchObject({ changed: 1, gains_text_document: 1, written_at: NOW });
    expect((await sweepSummaryRefresh(s.env, NOW + 1)).found).toBe(0);
  });

  it('runs over a dry run’s rows, and writes nothing where nothing changed', async () => {
    const s = setup('dry', async () => older);
    s.add('a', 1);
    await sweepSummaryRefresh(s.env, NOW);
    const run = { ...s.env, SUMMARY_REFRESH: 'run' } as Env;
    expect(await sweepSummaryRefresh(run, NOW + 1)).toEqual({
      found: 1,
      checked: 1,
      written: 0,
      failed: 0,
    });
    expect(s.rows()[0]).toMatchObject({ changed: 0, written_at: NOW + 1 });
    expect(s.stored('a').content_summary).toBe(JSON.stringify(older));
  });

  it('leaves a summary the room pushed in between, which is newer', async () => {
    const pushed: ContentSummary = { ...fresh, tabs: 2 };
    // The room's answer comes after its push: the push lands between the sweep's read and its write.
    const s = setup('run', async () => {
      s.sql
        .prepare('UPDATE documents SET content_summary = ? WHERE id = ?')
        .run(JSON.stringify(pushed), 'a');
      return fresh;
    });
    s.add('a', 1);
    expect((await sweepSummaryRefresh(s.env, NOW)).failed).toBe(0);
    expect(s.stored('a').content_summary).toBe(JSON.stringify(pushed));
  });

  it(`checks at most ${SUMMARY_REFRESH_BATCH} a run`, async () => {
    const s = setup('dry', async () => fresh);
    for (let i = 0; i < SUMMARY_REFRESH_BATCH + 3; i++) s.add(`d${String(i).padStart(3, '0')}`, i);
    expect((await sweepSummaryRefresh(s.env, NOW)).found).toBe(SUMMARY_REFRESH_BATCH);
    expect((await sweepSummaryRefresh(s.env, NOW)).found).toBe(3);
  });

  it.each([['dry'], ['run']])(
    'names a %s failure, and tries it again only after an hour',
    async (mode) => {
      let fail = true;
      const s = setup(mode, async () => {
        if (fail) throw new TypeError('room gone');
        return fresh;
      });
      s.add('a', 1);
      expect(await sweepSummaryRefresh(s.env, NOW)).toEqual({
        found: 1,
        checked: 0,
        written: 0,
        failed: 1,
      });
      expect(s.rows()[0]).toMatchObject({ error: 'TypeError', written_at: null });
      fail = false;
      expect((await sweepSummaryRefresh(s.env, NOW + SUMMARY_REFRESH_RETRY_MS - 1)).found).toBe(0);
      expect((await sweepSummaryRefresh(s.env, NOW + SUMMARY_REFRESH_RETRY_MS + 1)).failed).toBe(0);
      expect(s.rows()[0]).toMatchObject({ error: null, gains_text_document: 1 });
    },
  );
});
