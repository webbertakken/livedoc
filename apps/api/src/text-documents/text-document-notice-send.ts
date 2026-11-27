// A text document's window closes (docs/specs/034-text-documents/review.md "Notifications"): the comments new in it and
// the writing applied in it go, one email per person, to those whose setting asks for them and who may still comment on or edit the document,
// each read now, so a person lowered to Viewer or whose link has gone hears nothing. Best effort: every person
// skipped is logged with why, and nothing here throws past its caller's catch.
import { DEFAULT_NOTICE_SETTING, levelAtLeast, type NoticeSettingDto } from '@livedoc/api-schema';
import {
  TEXT_DOCUMENT_NOTICE_EMAILS_PER_HOUR,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import { noticeLinkToken } from '../auth/notice-links';
import { getDocumentMeta } from '../db/documents';
import { getOwnerEmail } from '../db/email-lifecycle';
import { getNotificationPrefs } from '../db/notification-prefs';
import {
  accountsOfIdentities,
  claimNoticeEmail,
  noticeReachOf,
} from '../db/text-document-notice-people';
import { noticeSettingsOf } from '../db/text-document-notice-settings';
import { keyOwners } from '../document-room/collab-key-owners';
import { emailEnabled, sendEmail } from '../email/client';
import { textDocumentNoticeEmail } from '../email/text-document-notice-email';
import { reportServerEvent } from '../server-telemetry';
import type { DocumentEnv } from '../types';
import {
  commentCountBucket,
  commentsFor,
  editsFor,
  newCommentsSince,
  noticeCandidates,
  noticeComments,
  noticeEdits,
  noticeKeys,
  type EditNotice,
  type NoticeComment,
  type NoticeEdit,
} from './notice-batches';

export type { EditNotice } from './notice-batches';

/** One tab's window: what it held as the window opened (its comment ids, its state), and who deleted what in it. */
export type NoticeWindow = {
  readonly tabId: string;
  readonly commentIds: readonly string[];
  readonly baseline: { readonly stateVector: Uint8Array; readonly deletions: Uint8Array };
  readonly deleters: readonly {
    readonly key: string;
    readonly name: string | null;
    readonly deletions: Uint8Array;
  }[];
};

export type NoticeSendDeps = {
  readonly env: DocumentEnv;
  readonly documentId: string;
  /** The tab's threads as they read now. */
  readonly threadsOf: (tabId: string) => Promise<TextDocumentThread[]>;
  /** The writing applied in a window, in place order. */
  readonly changesOf: (window: NoticeWindow) => Promise<EditNotice[]>;
  readonly now: number;
};

export type SkipReason = 'setting' | 'account-switch' | 'viewer' | 'no-access' | 'no-email' | 'cap';

const log = (line: string) => console.info(`[text-document-notices] ${line}`);

/** Why `personId` may not be emailed now, or how they reach the document when they may. */
async function reachFor(
  deps: NoticeSendDeps,
  personId: string,
): Promise<
  { skip: SkipReason } | { reach: { scopeTabId: string | null; shareCode: string | null } }
> {
  const { env, documentId, now } = deps;
  const prefs = await getNotificationPrefs(env, personId);
  if (!prefs.notifyTextDocuments) return { skip: 'account-switch' };
  const reach = await noticeReachOf(env, documentId, personId, now);
  if (!reach) return { skip: 'no-access' };
  if (!levelAtLeast(reach.level, 'participate')) return { skip: 'viewer' };
  return { reach };
}

/** Sends the window's emails; answers how many people were emailed. */
export async function sendNoticeBatches(
  deps: NoticeSendDeps,
  windows: readonly NoticeWindow[],
): Promise<number> {
  const { env, documentId } = deps;
  if (!emailEnabled(env)) return 0;
  const raw = (
    await Promise.all(
      windows.map(async (w) =>
        newCommentsSince(w.tabId, await deps.threadsOf(w.tabId), new Set(w.commentIds)),
      ),
    )
  ).flat();
  const settings = await noticeSettingsOf(env, documentId);
  // The writing is read only when someone asked for it: reading it walks each tab whole.
  const editsAsked = settings.some((s) => s.edits === 'added-or-removed');
  const changes = editsAsked
    ? (await Promise.all(windows.map((w) => deps.changesOf(w)))).flat()
    : [];
  if (raw.length === 0 && changes.length === 0) {
    log(`batch doc=${documentId} comments=0 changes=0`);
    return 0;
  }
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) {
    log(`batch doc=${documentId} skipped reason=document-gone`);
    return 0;
  }
  const keys = noticeKeys(raw);
  for (const change of changes) if (change.authorKey) keys.add(change.authorKey);
  const keyed = await keyOwners(env, documentId, keys);
  const accounts = await accountsOfIdentities(env, [...new Set(keyed.values())]);
  const owners = new Map([...keyed].map(([key, id]) => [key, accounts.get(id) ?? id]));
  const notices = noticeComments(raw, owners);
  const edits = noticeEdits(changes, owners);
  const settingOf = new Map(settings.map((s) => [s.ownerId, s as NoticeSettingDto]));
  const candidates = new Set(noticeCandidates(notices, settings));
  if (edits.length > 0)
    for (const s of settings) if (s.edits === 'added-or-removed') candidates.add(s.ownerId);
  log(
    `batch doc=${documentId} comments=${notices.length} changes=${edits.length} candidates=${candidates.size}`,
  );
  let sent = 0;
  for (const personId of [...candidates].sort()) {
    const setting = settingOf.get(personId) ?? DEFAULT_NOTICE_SETTING;
    const asked = {
      comments: commentsFor(personId, setting, notices),
      edits: editsFor(personId, setting, edits),
    };
    if (asked.comments.length === 0 && asked.edits.length === 0) continue;
    const outcome = await emailPerson(deps, personId, asked, meta.name);
    if (outcome === 'sent') sent += 1;
    else log(`skipped doc=${documentId} reason=${outcome}`);
  }
  return sent;
}

async function emailPerson(
  deps: NoticeSendDeps,
  personId: string,
  asked: { readonly comments: readonly NoticeComment[]; readonly edits: readonly NoticeEdit[] },
  documentName: string,
): Promise<SkipReason | 'sent' | 'failed'> {
  const { env, documentId, now } = deps;
  const found = await reachFor(deps, personId);
  if ('skip' in found) return found.skip;
  const { scopeTabId, shareCode } = found.reach;
  const inScope = <T extends { readonly tabId: string }>(list: readonly T[]) =>
    scopeTabId === null ? list : list.filter((item) => item.tabId === scopeTabId);
  const comments = inScope(asked.comments);
  const edits = inScope(asked.edits);
  if (comments.length === 0 && edits.length === 0) return 'no-access';
  const to = await getOwnerEmail(env, personId);
  if (!to) return 'no-email';
  if (!(await claimNoticeEmail(env, personId, now, TEXT_DOCUMENT_NOTICE_EMAILS_PER_HOUR)))
    return 'cap';
  const settingsToken = await noticeLinkToken(env, { ownerId: personId, documentId });
  const { oneClickUrl, ...email } = textDocumentNoticeEmail(env, {
    documentId,
    documentName,
    shareCode,
    settingsToken,
    comments,
    changes: edits,
  });
  const { sent } = await sendEmail(env, { ...email, to, oneClickUrl });
  if (!sent) return 'failed';
  if (comments.length > 0)
    await reportServerEvent(env, 'Comment', 'Notified', commentCountBucket(comments.length));
  log(`sent doc=${documentId} comments=${comments.length} changes=${edits.length}`);
  return 'sent';
}
