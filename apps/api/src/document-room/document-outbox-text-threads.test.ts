import type { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { LiveThreads, TextDocumentState, type TextDocumentComment } from '@livedoc/text-documents';
import { adderKeyFor } from '../adder-key';
import { appendLiveTabUpdate } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { drainOutbox } from './document-outbox';
import { harness } from './test-outbox-harness';

// docs/specs/013-workspace/inbox.md §2.7: a text document's threads and assigned comments reach the collaboration
// index from its live state, their authors' keys turned back into the identities they were made from.

const D = 'doc-1';
const sam = { userId: 'u-sam', memberId: 'm-sam', name: 'Sam Lee', handle: 'sam-lee' };

const info = vi.spyOn(console, 'info').mockImplementation(() => {});
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => {
  info.mockRestore();
  warn.mockRestore();
});

function textDocumentTab(room: DatabaseSync): void {
  room
    .prepare('INSERT INTO tabs (id, name, data, updated_at, rev) VALUES (?, ?, ?, 1, 1)')
    .run('td', 'Notes', '{"kind":"text-document","format":"odf","elements":[]}');
  room
    .prepare(
      'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, 0, 1)',
    )
    .run(D, 'td');
}

// A text document whose one thread holds a comment by each key, in order; `extra` on the last.
async function stateWithThread(
  keys: readonly (string | null)[],
  extra: Partial<TextDocumentComment> = {},
  resolved = false,
): Promise<Uint8Array> {
  const doc = TextDocumentState.load([TextDocumentState.fromBody([{ text: 'Quarterly results' }])]);
  const comment = (i: number, key: string | null): TextDocumentComment => ({
    id: `c${i}`,
    text: `Comment ${i}`,
    at: 10 + i,
    author: key
      ? { key, name: `Person ${i}`, colour: '#123456' }
      : { name: 'File', colour: '#6b7280', fromFile: true },
    ...(i === keys.length - 1 ? extra : {}),
  });
  LiveThreads.begin(
    doc,
    {
      id: 'th',
      tab: 't.0',
      ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 1),
      quote: 'Quarterly',
      comment: comment(0, keys[0]!),
    },
    'test',
  );
  keys.slice(1).forEach((key, i) => LiveThreads.reply(doc, 'th', comment(i + 1, key), 'test'));
  if (resolved) LiveThreads.resolve(doc, 'th', true, 'test');
  return TextDocumentState.encode(doc);
}

type ThreadRow = { tab_id: string; element_id: string; anchor: string; participant_ids: string };
const threadRows = (d1: DatabaseSync) =>
  d1
    .prepare(
      'SELECT tab_id, element_id, element_label, anchor, participant_ids, mentioned_ids, resolved FROM collab_threads WHERE document_id = ?',
    )
    .all(D) as (ThreadRow & { element_label: string; mentioned_ids: string; resolved: number })[];
const actionRows = (d1: DatabaseSync) =>
  d1
    .prepare(
      'SELECT element_id, action_id, anchor, name, status, assignee_user_id, assignee_member_id, assigner_id, team_id FROM collab_actions WHERE document_id = ?',
    )
    .all(D);

async function drained(update: Uint8Array, setUp: (d1: DatabaseSync) => void = () => {}) {
  const h = harness(D);
  setUp(h.d1);
  textDocumentTab(h.room);
  await appendLiveTabUpdate(h.env, TEXT_DOCUMENT_LIVE_TAB, 'td', update);
  await drainOutbox(h.env, D);
  return h;
}

describe('a text document tab’s push to the collaboration index', () => {
  it('writes a thread row anchored to text, its label the quote', async () => {
    const owner = await adderKeyFor(D, 'o');
    const { d1 } = await drained(await stateWithThread([owner], { mentions: [sam] }));
    expect(threadRows(d1)).toEqual([
      {
        tab_id: 'td',
        element_id: 'th',
        element_label: 'Quarterly',
        anchor: 'text',
        participant_ids: '["o"]',
        mentioned_ids: '["u-sam","m-sam"]',
        resolved: 0,
      },
    ]);
  });

  it('turns keys into the owner’s, a joined member’s, a visitor’s and an alias’s identities', async () => {
    const keys = await Promise.all(
      ['o', 'u-member', 'u-visitor', 'guest-old', 'u-invited', 'stranger'].map((id) =>
        adderKeyFor(D, id),
      ),
    );
    const { d1 } = await drained(await stateWithThread([...keys, null]), (db) => {
      db.exec(`INSERT INTO teams (id, name, created_at, updated_at) VALUES ('team-1', 'T', 1, 1);
        UPDATE documents SET team_id = 'team-1' WHERE id = '${D}';
        INSERT INTO team_members (id, team_id, user_id, role, status, created_at, updated_at)
          VALUES ('m1', 'team-1', 'u-member', 'member', 'joined', 1, 1),
                 ('m2', 'team-1', 'u-invited', 'member', 'invited', 1, 1);
        INSERT INTO shared_with (owner_id, document_id, role, last_seen)
          VALUES ('u-visitor', '${D}', 'edit', 1);
        INSERT INTO owner_aliases (owner_id, alias_id, created_at) VALUES ('u-visitor', 'guest-old', 1);`);
    });
    expect(JSON.parse(threadRows(d1)[0]!.participant_ids)).toEqual([
      'o',
      'u-member',
      'u-visitor',
      'guest-old',
    ]);
  });

  it('writes the current assignment as an open action, the assigner by identity', async () => {
    const owner = await adderKeyFor(D, 'o');
    const { d1 } = await drained(
      await stateWithThread([owner], { text: 'Check the totals', mentions: [sam], assignee: sam }),
    );
    expect(actionRows(d1)).toEqual([
      {
        element_id: 'th',
        action_id: 'c0',
        anchor: 'text',
        name: 'Check the totals',
        status: 'open',
        assignee_user_id: 'u-sam',
        assignee_member_id: 'm-sam',
        assigner_id: 'o',
        team_id: null,
      },
    ]);
  });

  it('marks the action done once the thread is resolved, naming no assigner it cannot find', async () => {
    const stranger = await adderKeyFor(D, 'stranger');
    const { d1 } = await drained(
      await stateWithThread([stranger], { mentions: [sam], assignee: sam }, true),
    );
    expect(actionRows(d1)).toMatchObject([{ status: 'done', assigner_id: '' }]);
    expect(threadRows(d1)).toMatchObject([{ resolved: 1, participant_ids: '[]' }]);
  });

  it('writes the document’s team on the action', async () => {
    const owner = await adderKeyFor(D, 'o');
    const { d1 } = await drained(
      await stateWithThread([owner], { mentions: [sam], assignee: sam }),
      (db) =>
        db.exec(`INSERT INTO teams (id, name, created_at, updated_at) VALUES ('team-1', 'T', 1, 1);
          UPDATE documents SET team_id = 'team-1' WHERE id = '${D}';`),
    );
    expect(actionRows(d1)).toMatchObject([{ team_id: 'team-1' }]);
  });

  it('matches someone who joins after a push at the tab’s next push', async () => {
    const later = await adderKeyFor(D, 'u-later');
    const h = await drained(await stateWithThread([later]));
    expect(threadRows(h.d1)[0]!.participant_ids).toBe('[]');
    h.d1.exec(`INSERT INTO teams (id, name, created_at, updated_at) VALUES ('team-1', 'T', 1, 1);
      UPDATE documents SET team_id = 'team-1' WHERE id = '${D}';
      INSERT INTO team_members (id, team_id, user_id, role, status, created_at, updated_at)
        VALUES ('m1', 'team-1', 'u-later', 'member', 'joined', 1, 1);`);
    // The tab's next change: a reply.
    await appendLiveTabUpdate(
      h.env,
      TEXT_DOCUMENT_LIVE_TAB,
      'td',
      await stateWithThread([later, later]),
    );
    await drainOutbox(h.env, D);
    expect(JSON.parse(threadRows(h.d1)[0]!.participant_ids)).toEqual(['u-later']);
  });

  it('lists someone it mentions whoever they are, the people unread', async () => {
    const { d1 } = await drained(
      await stateWithThread([await adderKeyFor(D, 'stranger')], { mentions: [sam] }),
    );
    expect(threadRows(d1)[0]!.mentioned_ids).toBe('["u-sam","m-sam"]');
  });

  it('logs every key it could not match, with their count', async () => {
    warn.mockClear();
    const stranger = await adderKeyFor(D, 'stranger');
    await drained(await stateWithThread([await adderKeyFor(D, 'o'), stranger, 'unknown-key']));
    expect(warn).toHaveBeenCalledWith(
      `[outbox] text-threads-unmatched document=${D} tab=td count=2 keys=${stranger},unknown-key`,
    );
  });

  it('logs no unmatched keys when every key is matched', async () => {
    warn.mockClear();
    await drained(await stateWithThread([await adderKeyFor(D, 'o')]));
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs what it wrote', async () => {
    info.mockClear();
    await drained(await stateWithThread([await adderKeyFor(D, 'o'), 'unknown-key']));
    expect(info).toHaveBeenCalledWith(
      `[outbox] text-threads document=${D} tab=td threads=1 actions=0 keys=2 resolved=1`,
    );
  });
});

describe('an element tab’s push to the collaboration index', () => {
  it('anchors its rows to the element', async () => {
    const { env, room, d1 } = harness(D);
    const element = {
      id: 'e1',
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      label: 'Box',
      commentThread: {
        comments: [{ id: 'c1', text: 'hi', createdAt: 1, authorName: 'A', authorColor: '#000' }],
        resolved: false,
      },
    };
    room
      .prepare('INSERT INTO tabs (id, name, data, updated_at, rev) VALUES (?, ?, ?, 1, 1)')
      .run('t1', 'Tab', JSON.stringify({ elements: [element] }));
    room
      .prepare(
        'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, 0, 1)',
      )
      .run(D, 't1');
    await drainOutbox(env, D);
    expect(threadRows(d1)).toMatchObject([{ element_id: 'e1', anchor: 'element' }]);
  });
});
