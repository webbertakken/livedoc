import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { textDocumentCommentsEmail, type NoticeEmailInput } from './text-document-notice-email';

// docs/specs/034-text-documents/review.md "Notifications" (The comments email; In every email).

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
};

describe('the comments email', () => {
  it('names the document, escaped, in its subject and heading', () => {
    const email = textDocumentCommentsEmail(env, input);
    expect(email.kind).toBe('TextDocumentComments');
    expect(email.subject).toBe('New comments in Plan <b>');
    expect(email.html).toContain('3 new comments');
    expect(email.html).toContain('<strong>Plan &lt;b&gt;</strong>');
    expect(email.html).not.toContain('Plan <b>');
  });

  it('groups each thread’s comments under its quote, with a link to the thread', () => {
    const { html } = textDocumentCommentsEmail(env, input);
    const first = html.indexOf('“Quarterly results”');
    expect(first).toBeGreaterThan(-1);
    expect(html.indexOf('Because.')).toBeGreaterThan(html.indexOf('Why &lt;this&gt;?'));
    expect(html.indexOf('Because.')).toBeLessThan(html.indexOf('A point'));
    expect(html).toContain('<strong>Someone</strong>: A point');
    expect(html).toContain('https://docs.test/document/D%201#t=t&el=th1&open=comments');
  });

  it('carries the signed settings link, the account-wide switch, and one-click unsubscribe', () => {
    const email = textDocumentCommentsEmail(env, input);
    expect(email.html).toContain('https://docs.test/notification-settings?token=tok.sig');
    expect(email.html).toContain('https://docs.test/explorer?settings=notifications');
    expect(email.unsubscribeUrl).toBe('https://docs.test/notification-settings?token=tok.sig');
    expect(email.oneClickUrl).toBe('https://docs.test/api/notification-links/tok.sig');
  });

  it('carries the link a visitor reaches it through', () => {
    const { html } = textDocumentCommentsEmail(env, { ...input, shareCode: 'CODE' });
    expect(html).toContain('/document/D%201?s=CODE#t=t&el=th1');
    expect(html).toContain('/document/D%201?s=CODE"');
  });

  it('offers only the account-wide switch where nothing is signed, and says one comment as one', () => {
    const email = textDocumentCommentsEmail(env, {
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
