import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiveThreads,
  TextDocumentState,
  type TextDocumentComment,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import { adderKeyFor } from '../adder-key';
import { createShareLink } from '../db/share';
import { recordSharedAccess } from '../db/shared';
import { writeNoticeSetting } from '../db/text-document-notice-settings';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { sendNoticeBatches } from './text-document-notice-send';

// docs/specs/034-text-documents/review.md "Notifications" (Who is emailed; Batches; The comments email): read at the
// send, a Viewer never, a person lowered to Viewer at once, guests never, the cap per person.

const T = 1_700_000_000_000;
let db: SqliteD1;
let sent: { to: string; subject: string; html: string; headers?: Record<string, string> }[];
const info = vi.spyOn(console, 'info').mockImplementation(() => {});
afterAll(() => info.mockRestore());

const run = (sql: string, ...args: (string | number | null)[]) => db.sql.prepare(sql).run(...args);

function person(id: string, email: string | null) {
  if (email)
    run('INSERT INTO email_lifecycle (owner_id, email, created_at) VALUES (?, ?, ?)', id, email, T);
}

async function comment(i: number, who: string, extra: Partial<TextDocumentComment> = {}) {
  return {
    id: `c${i}`,
    text: `Comment ${i}`,
    at: T + i,
    author: { key: await adderKeyFor('D', who), name: who, colour: '#123456' },
    ...extra,
  } satisfies TextDocumentComment;
}

/** One thread `th`, its comments by `who` in order. */
async function threads(
  who: readonly string[],
  extra: Partial<TextDocumentComment> = {},
): Promise<TextDocumentThread[]> {
  const doc = TextDocumentState.load([TextDocumentState.fromBody([{ text: 'Quarterly results' }])]);
  LiveThreads.begin(
    doc,
    {
      id: 'th',
      tab: 't.0',
      ...LiveThreads.anchorFor(TextDocumentState.body(doc), 0, 9),
      quote: 'Quarterly',
      comment: await comment(0, who[0]!),
    },
    'test',
  );
  for (const [i, w] of who.slice(1).entries())
    LiveThreads.reply(
      doc,
      'th',
      await comment(i + 1, w, i === who.length - 2 ? extra : {}),
      'test',
    );
  return LiveThreads.read(doc);
}

async function send(read: TextDocumentThread[], before = ['c0']) {
  return sendNoticeBatches(
    { env: db.env, documentId: 'D', threadsOf: async () => read, now: Date.now() },
    [{ tabId: 'td', commentIds: before }],
  );
}

beforeEach(async () => {
  db = sqliteD1({
    RESEND_API_KEY: 're_test',
    BETTER_AUTH_SECRET: 's'.repeat(40),
    APP_BASE_URL: 'https://docs.test',
  });
  run(
    'INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES (?, ?, ?, ?, ?, 1)',
    'D',
    'owner',
    'Plan',
    T,
    T,
  );
  person('owner', 'owner@x.test');
  person('pat', 'pat@x.test');
  person('vic', 'vic@x.test');
  await createShareLink(db.env, 'D', 'PART', 'participate');
  await createShareLink(db.env, 'D', 'VIEW', 'view');
  await recordSharedAccess(db.env, 'pat', 'D', 'participate', null, 'PART');
  await recordSharedAccess(db.env, 'vic', 'D', 'view', null, 'VIEW');
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        to: string[];
        subject: string;
        html: string;
        headers?: Record<string, string>;
      };
      sent.push({ to: body.to[0]!, subject: body.subject, html: body.html, headers: body.headers });
      return new Response('{}', { status: 200 });
    }),
  );
  info.mockClear();
});

describe('a closed window’s emails', () => {
  it('tell whoever the thread involves of a reply, never its author', async () => {
    expect(await send(await threads(['owner', 'pat']))).toBe(1);
    expect(sent.map((s) => s.to)).toEqual(['owner@x.test']);
    expect(sent[0]!.subject).toBe('New comments in Plan');
    expect(sent[0]!.html).toContain('Comment 1');
    expect(sent[0]!.html).not.toContain('Comment 0');
    expect(sent[0]!.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('carry a visitor’s link, so the thread opens for them', async () => {
    await send(await threads(['pat', 'owner']));
    expect(sent.map((s) => s.to)).toEqual(['pat@x.test']);
    expect(sent[0]!.html).toContain('/document/D?s=PART#t=td&el=th&open=comments');
  });

  it('never reach a Viewer, whatever they chose', async () => {
    await writeNoticeSetting(db.env, 'D', 'vic', { comments: 'all', edits: 'none' }, T);
    await send(await threads(['owner', 'pat']));
    expect(sent.map((s) => s.to)).toEqual(['owner@x.test']);
    expect(info).toHaveBeenCalledWith('[text-document-notices] skipped doc=D reason=viewer');
  });

  it('stop at once for a person lowered to Viewer', async () => {
    run("UPDATE share_links SET level = 'view', role = 'view' WHERE code = 'PART'");
    await send(await threads(['pat', 'owner']));
    expect(sent).toEqual([]);
    expect(info).toHaveBeenCalledWith('[text-document-notices] skipped doc=D reason=no-access');
  });

  it('reach those who asked for all comments, and not those who asked for none', async () => {
    await writeNoticeSetting(db.env, 'D', 'pat', { comments: 'all', edits: 'none' }, T);
    await writeNoticeSetting(db.env, 'D', 'owner', { comments: 'none', edits: 'none' }, T);
    await send(await threads(['owner', 'owner']));
    expect(sent.map((s) => s.to)).toEqual(['pat@x.test']);
  });

  it('leave out a comment that mentioned the person, which emailed them at once', async () => {
    await send(
      await threads(['owner', 'pat'], {
        mentions: [{ userId: 'owner', name: 'Owner', handle: 'owner' }],
      }),
    );
    expect(sent).toEqual([]);
  });

  it('reach no one with the account-wide switch off, nor anyone without an address', async () => {
    run(
      "INSERT INTO user_preferences (owner_id, prefs, updated_at) VALUES ('owner', '{\"notifyTextDocuments\":false}', 1)",
    );
    await send(await threads(['owner', 'pat']));
    run('DELETE FROM user_preferences');
    run("DELETE FROM email_lifecycle WHERE owner_id = 'owner'");
    await send(await threads(['owner', 'pat']));
    expect(sent).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      '[text-document-notices] skipped doc=D reason=account-switch',
    );
    expect(info).toHaveBeenCalledWith('[text-document-notices] skipped doc=D reason=no-email');
  });

  it('stop at the hourly cap', async () => {
    for (let i = 0; i < 12; i++)
      run(
        "INSERT INTO text_document_notice_sends (owner_id, sent_at) VALUES ('owner', ?)",
        Date.now(),
      );
    await send(await threads(['owner', 'pat']));
    expect(sent).toEqual([]);
    expect(info).toHaveBeenCalledWith('[text-document-notices] skipped doc=D reason=cap');
  });

  it('send nothing for a window with nothing new, a resolved thread, or no email', async () => {
    expect(await send(await threads(['owner', 'pat']), ['c0', 'c1'])).toBe(0);
    const resolved = (await threads(['owner', 'pat'])).map((t) => ({ ...t, resolved: true }));
    expect(await send(resolved)).toBe(0);
    db.env.RESEND_API_KEY = undefined;
    expect(await send(await threads(['owner', 'pat']))).toBe(0);
    expect(sent).toEqual([]);
  });

  it('send nothing for a document gone meanwhile', async () => {
    run("UPDATE documents SET trashed_at = 1 WHERE id = 'D'");
    expect(await send(await threads(['owner', 'pat']))).toBe(0);
    expect(info).toHaveBeenCalledWith(
      '[text-document-notices] batch doc=D skipped reason=document-gone',
    );
  });

  it('count an email that did not go as not sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 })),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await send(await threads(['owner', 'pat']))).toBe(0);
    error.mockRestore();
  });
});
