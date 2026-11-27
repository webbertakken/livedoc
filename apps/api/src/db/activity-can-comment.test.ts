import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Tab } from '@livedoc/document';
import { sqliteD1 } from '../test-sqlite-d1';
import { readActivity } from './collab-index';
import { upsertTab } from './tabs';

// A thread says whether the reader may comment on its document (docs/specs/013-workspace/inbox.md §3, §4): an
// owner's and a joined teammate's are an Editor's; a shared one follows the level of the link it is reached through.

const T0 = 1_700_000_000_000;

function insert(sql: DatabaseSync, table: string, row: Record<string, string | number | null>) {
  const cols = Object.keys(row);
  sql
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...Object.values(row));
}

const tab = {
  id: 't1',
  name: 'Flow',
  elements: [
    {
      id: 'e1',
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      label: 'Checkout',
      commentThread: {
        resolved: false,
        comments: [
          {
            id: 'c1',
            text: 'hey @reader',
            createdAt: T0,
            authorName: 'Owner',
            authorColor: '#000',
            authorId: 'owner',
            mentions: [{ userId: 'reader', memberId: null, name: 'R', handle: 'reader' }],
          },
        ],
      },
    },
  ],
} as unknown as Tab;

async function seed(teamId: string | null = null) {
  const db = sqliteD1();
  insert(db.sql, 'teams', { id: 'tm', name: 'Team', created_at: T0, updated_at: T0 });
  insert(db.sql, 'team_members', {
    id: 'm-reader',
    team_id: 'tm',
    user_id: 'reader',
    email: 'reader@example.com',
    role: 'member',
    status: 'joined',
    created_at: T0,
    updated_at: T0,
  });
  insert(db.sql, 'documents', {
    id: 'D',
    owner_id: 'owner',
    name: 'Payments',
    shareable: 1,
    team_id: teamId,
    saved_at: T0,
    created_at: T0,
  });
  await upsertTab(db.env, 'D', tab, 0);
  return db;
}

async function shareAt(db: ReturnType<typeof sqliteD1>, level: 'view' | 'participate' | 'edit') {
  // A participate link is stored as role 'view' with its level beside it (migration 0080).
  const role = level === 'edit' ? 'edit' : 'view';
  insert(db.sql, 'share_links', {
    code: `code-${level}`,
    document_id: 'D',
    role,
    level,
    created_at: 1,
  });
  insert(db.sql, 'shared_with', {
    owner_id: 'reader',
    document_id: 'D',
    role,
    level,
    last_seen: 1,
  });
}

const canComment = async (db: ReturnType<typeof sqliteD1>, reader: string) =>
  (await readActivity(db.env, reader, { limit: 10 })).threads.map((t) => t.canComment);

describe('Activity: canComment', () => {
  it('is true on a document the reader owns', async () => {
    const db = await seed();
    expect(await canComment(db, 'owner')).toEqual([true]);
  });

  it('is true on a document in a team the reader joined', async () => {
    const db = await seed('tm');
    expect(await canComment(db, 'reader')).toEqual([true]);
  });

  it('is false through a view link', async () => {
    const db = await seed();
    await shareAt(db, 'view');
    expect(await canComment(db, 'reader')).toEqual([false]);
  });

  it('is true through a participate link', async () => {
    const db = await seed();
    await shareAt(db, 'participate');
    expect(await canComment(db, 'reader')).toEqual([true]);
  });

  it('is true through an edit link', async () => {
    const db = await seed();
    await shareAt(db, 'edit');
    expect(await canComment(db, 'reader')).toEqual([true]);
  });
});

// review.md "What a Viewer receives"; inbox.md §4: a text document's threads and assigned comments are never a Viewer's.
describe("Activity: a text document's comments", () => {
  async function textDocument(level: 'view' | 'participate' | null) {
    const db = await seed();
    if (level) await shareAt(db, level);
    // The room's rows land first (the drain runs before a read), then become a text document's.
    await readActivity(db.env, 'reader', { limit: 1 });
    db.sql.prepare("UPDATE collab_threads SET anchor = 'text'").run();
    insert(db.sql, 'collab_actions', {
      document_id: 'D',
      tab_id: 't1',
      tab_name: 'Flow',
      element_id: 'th1',
      element_label: 'Checkout',
      action_id: 'a1',
      name: 'Check the totals',
      description: '',
      assignee_user_id: 'reader',
      assignee_name: 'R',
      assigner_id: 'owner',
      assigner_name: 'Owner',
      status: 'open',
      created_at: T0,
      updated_at: T0,
      anchor: 'text',
    });
    return readActivity(db.env, 'reader', { limit: 10 });
  }

  it('lists none of them through a view link', async () => {
    const read = await textDocument('view');
    expect(read.threads).toEqual([]);
    expect(read.actions).toEqual([]);
  });

  it('lists them through a participate link', async () => {
    const read = await textDocument('participate');
    expect(read.threads).toHaveLength(1);
    expect(read.actions).toHaveLength(1);
  });

  it('lists the owner’s, whose level is no link’s', async () => {
    const db = await seed();
    await readActivity(db.env, 'owner', { limit: 1 });
    db.sql.prepare("UPDATE collab_threads SET anchor = 'text'").run();
    expect(await canComment(db, 'owner')).toEqual([true]);
  });
});
