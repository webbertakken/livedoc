import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { cpuBudgetMs, cpuMsOfAsync } from '@livedoc/vitest-config/cpu-time';
import type { Tab } from '@livedoc/document';
import { getTab, upsertTab } from '../db/tabs';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { DocumentEnv } from '../types';
import { readDocumentOutline } from './document-content';
import { DocumentDb } from './document-db';
import { migrateDocumentSchema } from './document-schema';
import { drainShares, receiveShares } from './tab-shares';

// The room store's budgets (docs/specs/006-document/document-storage.md),
// node:sqlite standing in for the room's SQLite. Each case keeps the best of a few runs, in CPU time
// (docs/specs/003-system-architecture/testing.md "Speed budgets are CPU time"), so neither a busy machine's wait for a
// core nor one slow tick fails it. cpuBudgetMs keeps each written budget locally and gives it headroom on CI and under
// coverage, where the instrumentation slows the same work.

const D = 'doc-1';
const RUNS = 5;

let env: DocumentEnv;

// A room of its own holding document `id`.
function roomEnv(id: string): DocumentEnv {
  const room = new DatabaseSync(':memory:');
  room.exec('PRAGMA foreign_keys = ON');
  const sql = nodeDocumentSql(room);
  migrateDocumentSchema((q) => sql.exec(q));
  const db = new DocumentDb(sql, {
    transaction: nodeTransaction(room),
    ensureSchema: () => {},
    hasSchema: () => true,
    onWrite: () => {},
  });
  room.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('${id}', 1, 1)`);
  return { DOCUMENT_DB: db.asD1() } as unknown as DocumentEnv;
}

beforeEach(() => {
  const room = new DatabaseSync(':memory:');
  room.exec('PRAGMA foreign_keys = ON');
  const sql = nodeDocumentSql(room);
  migrateDocumentSchema((q) => sql.exec(q));
  const db = new DocumentDb(sql, {
    transaction: nodeTransaction(room),
    ensureSchema: () => {},
    hasSchema: () => true,
    onWrite: () => {},
  });
  env = { DOCUMENT_DB: db.asD1() } as unknown as DocumentEnv;
  room.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('${D}', 1, 1)`);
});

// The fastest of RUNS, in CPU time: wall-clock time also counts waiting for a core while other suites run, which
// failed a 30 ms read at 34 ms on CI. Budgets are cpuBudgetMs, widened on CI and under coverage
// (packages/vitest-config/cpu-time.js).
async function best(run: (i: number) => Promise<unknown>): Promise<number> {
  let fastest = Infinity;
  for (let i = 0; i < RUNS; i++) {
    fastest = Math.min(fastest, await cpuMsOfAsync(() => run(i)));
  }
  return fastest;
}

const box = (i: number) => ({
  id: `e${i}`,
  type: 'shape',
  shape: 'square',
  x: i,
  y: i,
  width: 100,
  height: 60,
  label: `Box number ${i} with a label long enough to look like a real one`,
});

// A tab of about `bytes` bytes of JSON.
function bigTab(id: string, bytes: number): Tab {
  const elements: unknown[] = [];
  let size = 0;
  for (let i = 0; size < bytes; i++) {
    const el = box(i);
    elements.push(el);
    size += JSON.stringify(el).length + 1;
  }
  return { id, name: id, elements } as Tab;
}

describe('the room store budgets', () => {
  it('saves a 1 MB tab under 60 ms and reads it under 30 ms', async () => {
    const tab = bigTab('big', 1_000_000);
    const save = await best(() => upsertTab(env, D, tab, 0));
    const read = await best(() => getTab(env, D, 'big'));
    expect(save).toBeLessThan(cpuBudgetMs(60));
    expect(read).toBeLessThan(cpuBudgetMs(30));
  });

  it('saves a tab placing 500 images under 15 ms', async () => {
    const elements = Array.from({ length: 500 }, (_, i) => ({
      id: `img${i}`,
      type: 'image',
      x: i,
      y: 0,
      width: 10,
      height: 10,
      imageId: `image-${i}`,
    }));
    const tab = { id: 'gallery', name: 'Gallery', elements } as unknown as Tab;
    const save = await best(() => upsertTab(env, D, tab, 0));
    expect(save).toBeLessThan(cpuBudgetMs(15));
    const placed = await env.DOCUMENT_DB.prepare('SELECT COUNT(*) AS n FROM image_refs').first<{
      n: number;
    }>();
    expect(placed?.n).toBe(500);
  });

  it('sends a 1 MB shared tab to 20 holders, each taking it in, under 2 s', async () => {
    const tab = bigTab('shared', 1_000_000);
    await upsertTab(env, D, tab, 0);
    const holders = new Map<string, DocumentEnv>();
    for (let i = 0; i < 20; i++) {
      const id = `holder-${i}`;
      const holder = roomEnv(id);
      await upsertTab(holder, id, tab, 0);
      await holder.DOCUMENT_DB.prepare("UPDATE tabs SET updated_at = 1 WHERE id = 'shared'").run();
      holders.set(id, holder);
      await env.DOCUMENT_DB.prepare('INSERT INTO tab_shares (tab_id, document_id) VALUES (?, ?)')
        .bind('shared', id)
        .run();
    }
    await upsertTab(env, D, { ...tab, name: 'Shared, renamed' }, 0);
    let result: Awaited<ReturnType<typeof drainShares>> | undefined;
    const took = await cpuMsOfAsync(async () => {
      result = await drainShares(env, D, (to, messages) =>
        receiveShares(holders.get(to)!, to, D, messages),
      );
    });
    expect(result).toMatchObject({ sent: 20, failed: 0 });
    expect(took).toBeLessThan(cpuBudgetMs(2_000));
    const taken = await holders
      .get('holder-19')!
      .DOCUMENT_DB.prepare('SELECT name FROM tabs')
      .first<{
        name: string;
      }>();
    expect(taken?.name).toBe('Shared, renamed');
  });

  it('outlines a 200-tab document under 10 ms', async () => {
    for (let i = 0; i < 200; i++) {
      await upsertTab(env, D, { id: `t${i}`, name: `Tab ${i}`, elements: [box(i)] } as Tab, i);
    }
    const outline = await best(() => readDocumentOutline(env, D));
    expect(outline).toBeLessThan(cpuBudgetMs(10));
  });
});
