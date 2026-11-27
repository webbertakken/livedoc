import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { textDocumentNoticeEmail, type NoticeEmailInput } from './text-document-notice-email';

// docs/specs/034-text-documents/review.md "Notifications" (The comments email; The edits email; In every email).

const env = { APP_BASE_URL: 'https://docs.test' } as Env;
const input: NoticeEmailInput = {
  documentId: 'D 1',
  documentName: 'Plan <b>',
  shareCode: null,
  settingsToken: 'tok.sig',
  comments: [
    {
      tabId: 't',
      threadId: 'th1',
      quote: 'Quarterly   results',
      authorName: 'Ada',
      text: 'Why <this>?',
    },
    { tabId: 't', threadId: 'th2', quote: '', authorName: '', text: 'A point' },
    { tabId: 't', threadId: 'th1', quote: 'Quarterly results', authorName: 'Bo', text: 'Because.' },
  ],
  changes: [],
};

describe('the comments email', () => {
  it('names the document, escaped, in its subject and heading', () => {
    const email = textDocumentNoticeEmail(env, input);
    expect(email.kind).toBe('TextDocumentComments');
    expect(email.subject).toBe('New comments in Plan <b>');
    expect(email.html).toContain('3 new comments');
    expect(email.html).toContain('<strong>Plan &lt;b&gt;</strong>');
    expect(email.html).not.toContain('Plan <b>');
  });

  it('groups each thread’s comments under its quote, with a link to the thread', () => {
    const { html } = textDocumentNoticeEmail(env, input);
    const first = html.indexOf('“Quarterly results”');
    expect(first).toBeGreaterThan(-1);
    expect(html.indexOf('Because.')).toBeGreaterThan(html.indexOf('Why &lt;this&gt;?'));
    expect(html.indexOf('Because.')).toBeLessThan(html.indexOf('A point'));
    expect(html).toContain('<strong>Someone</strong>: A point');
    expect(html).toContain('https://docs.test/document/D%201#t=t&el=th1&open=comments');
  });

  it('carries the signed settings link, the account-wide switch, and one-click unsubscribe', () => {
    const email = textDocumentNoticeEmail(env, input);
    expect(email.html).toContain('https://docs.test/notification-settings?token=tok.sig');
    expect(email.html).toContain('https://docs.test/explorer?settings=notifications');
    expect(email.unsubscribeUrl).toBe('https://docs.test/notification-settings?token=tok.sig');
    expect(email.oneClickUrl).toBe('https://docs.test/api/notification-links/tok.sig');
  });

  it('carries the link a visitor reaches it through', () => {
    const { html } = textDocumentNoticeEmail(env, { ...input, shareCode: 'CODE' });
    expect(html).toContain('/document/D%201?s=CODE#t=t&el=th1');
    expect(html).toContain('/document/D%201?s=CODE"');
  });

  it('offers only the account-wide switch where nothing is signed, and says one comment as one', () => {
    const email = textDocumentNoticeEmail(env, {
      ...input,
      documentName: ' ',
      settingsToken: null,
      comments: [input.comments[0]!],
    });
    expect(email.subject).toBe('New comments in a text document');
    expect(email.html).toContain('A new comment');
    expect(email.html).not.toContain('notification-settings?token');
    expect(email.unsubscribeUrl).toBe('https://docs.test/explorer?settings=notifications');
    expect(email.oneClickUrl).toBeNull();
  });
});

describe('the edits email', () => {
  const changes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: i % 2 === 0 ? ('added' as const) : ('removed' as const),
      text: `Line <${i}>`,
      authorName: i === 1 ? null : 'Ada',
    }));

  it('says each change with who made it, escaped, as changes alone', () => {
    const email = textDocumentNoticeEmail(env, { ...input, comments: [], changes: changes(2) });
    expect(email.kind).toBe('TextDocumentEdits');
    expect(email.subject).toBe('Changes in Plan <b>');
    expect(email.html).toContain('2 changes');
    expect(email.html).toContain('<strong>Ada</strong> added: “Line &lt;0&gt;”');
    expect(email.html).toContain('<strong>Someone</strong> removed: “Line &lt;1&gt;”');
    expect(email.html).not.toContain('more change');
  });

  it('shows at most twenty changes, then how many more', () => {
    const { html } = textDocumentNoticeEmail(env, { ...input, comments: [], changes: changes(23) });
    expect(html).toContain('Line &lt;19&gt;');
    expect(html).not.toContain('Line &lt;20&gt;');
    expect(html).toContain('and 3 more changes');
    const one = textDocumentNoticeEmail(env, { ...input, comments: [], changes: changes(21) });
    expect(one.html).toContain('and 1 more change<');
  });

  it('cuts a long change', () => {
    const { html } = textDocumentNoticeEmail(env, {
      ...input,
      comments: [],
      changes: [{ kind: 'added', text: 'word '.repeat(100), authorName: 'Ada' }],
    });
    const said = /added: “([^”]*)”/.exec(html)![1]!;
    expect(said.length).toBeLessThanOrEqual(201);
    expect(said.endsWith('…')).toBe(true);
  });

  it('puts comments first when both go in one email', () => {
    const email = textDocumentNoticeEmail(env, { ...input, changes: changes(1) });
    expect(email.kind).toBe('TextDocumentCommentsAndEdits');
    expect(email.subject).toBe('New comments and changes in Plan <b>');
    expect(email.html).toContain('3 new comments and a change');
    expect(email.html.indexOf('A point')).toBeLessThan(email.html.indexOf('Line &lt;0&gt;'));
    const single = textDocumentNoticeEmail(env, {
      ...input,
      comments: [input.comments[0]!],
      changes: changes(2),
    });
    expect(single.html).toContain('A new comment and 2 changes');
  });
});
