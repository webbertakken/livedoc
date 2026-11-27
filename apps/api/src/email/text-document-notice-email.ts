// A text document's notification email (docs/specs/034-text-documents/review.md "Notifications", The comments email;
// The edits email; In every email): one person's new comments of one document's window, grouped by thread, each with
// its author, the stretch it is on and its text, and a link to the thread; then the writing others added or removed,
// each change with who made it, at most TEXT_DOCUMENT_NOTICE_EXCERPTS_MAX of them; the signed link to this document's settings and the
// account-wide switch. Everything anyone wrote is escaped; nothing goes to someone who cannot comment on or edit it.
import { cutAtWord } from '@livedoc/document';
import {
  TEXT_DOCUMENT_NOTICE_CHANGE_CHARS,
  TEXT_DOCUMENT_NOTICE_EXCERPTS_MAX,
  TEXT_DOCUMENT_NOTICE_QUOTE_CHARS,
} from '@livedoc/text-documents';
import type { Env } from '../types';
import { appBaseUrl } from './client';
import {
  escapeHtml,
  escapeText,
  mentionQuote,
  profilePath,
  shell,
  type RenderedEmail,
} from './templates';

/** One comment as the email says it. */
export type NoticeEmailComment = {
  readonly tabId: string;
  readonly threadId: string;
  readonly quote: string;
  readonly authorName: string;
  readonly text: string;
};

/** One change as the email says it: who made it (null: no one recorded) and the writing. */
export type NoticeEmailChange = {
  readonly kind: 'added' | 'removed';
  readonly text: string;
  readonly authorName: string | null;
};

export type NoticeEmailInput = {
  readonly documentId: string;
  readonly documentName: string;
  /** The link the person reaches the document through; null for their own or their team's. */
  readonly shareCode: string | null;
  /** Oldest first. */
  readonly comments: readonly NoticeEmailComment[];
  /** In place order; empty when the person asked for no edits. */
  readonly changes: readonly NoticeEmailChange[];
  /** The signed settings link's door (`/api/notification-links/<token>`), null on a host that signs nothing. */
  readonly settingsToken: string | null;
};

/** The email, and where its one-click unsubscribe posts (null without a signed link). */
export type NoticeEmail = RenderedEmail & { readonly oneClickUrl: string | null };

const MUTED = '#475569';
const QUOTE = '#64748b';

function threadHref(
  base: string,
  input: NoticeEmailInput,
  tabId: string,
  threadId: string,
): string {
  const query = input.shareCode ? `?s=${encodeURIComponent(input.shareCode)}` : '';
  return `${base}/document/${encodeURIComponent(input.documentId)}${query}#t=${encodeURIComponent(tabId)}&el=${encodeURIComponent(threadId)}&open=comments`;
}

/** The comments by thread, each thread where its first new comment falls. */
function byThread(comments: readonly NoticeEmailComment[]): NoticeEmailComment[][] {
  const threads = new Map<string, NoticeEmailComment[]>();
  for (const c of comments) {
    const key = `${c.tabId}\n${c.threadId}`;
    threads.set(key, [...(threads.get(key) ?? []), c]);
  }
  return [...threads.values()];
}

function threadBlock(base: string, input: NoticeEmailInput, thread: NoticeEmailComment[]): string {
  const first = thread[0]!;
  const quote = first.quote.trim()
    ? `<span style="display:block;margin:0 0 6px;color:${QUOTE};border-left:3px solid #cbd5e1;padding-left:8px">“${escapeHtml(cutAtWord(first.quote.replace(/\s+/g, ' '), TEXT_DOCUMENT_NOTICE_QUOTE_CHARS))}”</span>`
    : '';
  const lines = thread
    .map(
      (c) =>
        `<span style="display:block;margin:0 0 4px;color:${MUTED}"><strong>${escapeHtml(c.authorName.trim() || 'Someone')}</strong>: ${escapeHtml(mentionQuote(c.text))}</span>`,
    )
    .join('');
  const open = `<a href="${threadHref(base, input, first.tabId, first.threadId)}" style="color:#2563eb;text-decoration:underline">Open</a>`;
  return `${quote}${lines}${open}`;
}

function changeLine(change: NoticeEmailChange): string {
  const who = escapeHtml(change.authorName?.trim() || 'Someone');
  const text = escapeHtml(
    cutAtWord(change.text.replace(/\s+/g, ' '), TEXT_DOCUMENT_NOTICE_CHANGE_CHARS),
  );
  return `<span style="color:${MUTED}"><strong>${who}</strong> ${change.kind}: “${text}”</span>`;
}

/** The changes shown, and the line saying how many more there are. */
function changePoints(changes: readonly NoticeEmailChange[]): string[] {
  const shown = changes.slice(0, TEXT_DOCUMENT_NOTICE_EXCERPTS_MAX).map(changeLine);
  const more = changes.length - shown.length;
  return more > 0
    ? [
        ...shown,
        `<span style="color:${MUTED}">and ${more} more ${more === 1 ? 'change' : 'changes'}</span>`,
      ]
    : shown;
}

const counted = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** What the email is: its kind for the telemetry, its subject before the name, and its heading. */
function emailOf(comments: number, changes: number) {
  const commentsSaid = counted(comments, 'A new comment', 'new comments');
  const changesSaid = counted(changes, 'A change', 'changes');
  if (changes === 0)
    return {
      kind: 'TextDocumentComments',
      subject: 'New comments in',
      heading: commentsSaid,
    } as const;
  if (comments === 0)
    return { kind: 'TextDocumentEdits', subject: 'Changes in', heading: changesSaid } as const;
  return {
    kind: 'TextDocumentCommentsAndEdits',
    subject: 'New comments and changes in',
    heading: `${commentsSaid} and ${changesSaid.charAt(0).toLowerCase()}${changesSaid.slice(1)}`,
  } as const;
}

export function textDocumentNoticeEmail(env: Env, input: NoticeEmailInput): NoticeEmail {
  const base = appBaseUrl(env);
  const name = input.documentName.trim();
  const docHtml = name ? escapeHtml(name) : 'a text document';
  const docText = name ? escapeText(name) : 'a text document';
  const query = input.shareCode ? `?s=${encodeURIComponent(input.shareCode)}` : '';
  const settingsPage = input.settingsToken
    ? `${base}/notification-settings?token=${encodeURIComponent(input.settingsToken)}`
    : null;
  const what = emailOf(input.comments.length, input.changes.length);
  const settings = settingsPage
    ? `<a href="${settingsPage}" style="color:#2563eb;text-decoration:underline">Notification settings</a> changes what this document emails you. `
    : '';
  const footer = `You’re receiving this because of your notification settings for ${docHtml}. ${settings}<a href="${profilePath(env)}" style="color:#2563eb;text-decoration:underline">Turn off all text document emails</a> in Settings.`;
  return {
    kind: what.kind,
    subject: `${what.subject} ${docText}`,
    html: shell(env, {
      heading: what.heading,
      intro: `In <strong>${docHtml}</strong>:`,
      points: [
        ...byThread(input.comments).map((thread) => threadBlock(base, input, thread)),
        ...changePoints(input.changes),
      ],
      ctaText: 'Open the document',
      ctaHref: `${base}/document/${encodeURIComponent(input.documentId)}${query}`,
      footer,
    }),
    unsubscribeUrl: settingsPage ?? profilePath(env),
    oneClickUrl: input.settingsToken
      ? `${base}/api/notification-links/${encodeURIComponent(input.settingsToken)}`
      : null,
  };
}
