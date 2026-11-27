// /api/notification-links/<token> (docs/specs/034-text-documents/review.md "Notifications", In every email): the open
// doors behind a text document email's signed settings link. No sign-in: the token names one person and one document,
// and these routes read and change that person's setting for that document, and nothing else.
//   GET   the document's name and the setting; never writes, so a mail client's link scanner changes nothing
//   PUT   keep a setting ({ comments, edits }), the page's one click
//   POST  RFC 8058's one-click unsubscribe (List-Unsubscribe-Post): both set to none
// Limited per network in index.ts, on the open-link limiter the invite Decline link uses.
import { parseNoticeSetting, type NoticeLinkDto, type NoticeSettingDto } from '@livedoc/api-schema';
import { readNoticeLinkToken } from '../auth/notice-links';
import { getDocumentMeta } from '../db/documents';
import { readNoticeSetting, writeNoticeSetting } from '../db/text-document-notice-settings';
import { emailEnabled } from '../email/client';
import { json, notFound } from '../responses';
import type { RouteContext } from './context';

const NONE: NoticeSettingDto = { comments: 'none', edits: 'none' };
const linkNotFound = () => json({ error: 'link_not_found' }, { status: 404 });

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleNoticeLink(ctx: RouteContext, token: string): Promise<Response> {
  const { request, env } = ctx;
  if (!['GET', 'PUT', 'POST'].includes(request.method)) return notFound();
  if (!emailEnabled(env)) return linkNotFound();
  const subject = await readNoticeLinkToken(env, token);
  if (!subject) return linkNotFound();
  const meta = await getDocumentMeta(env, subject.documentId);
  if (!meta) return linkNotFound();
  const answer = (setting: NoticeSettingDto): Response =>
    json({ documentName: meta.name, setting } satisfies NoticeLinkDto);
  if (request.method === 'GET')
    return answer(await readNoticeSetting(env, subject.documentId, subject.ownerId));
  const setting = request.method === 'POST' ? NONE : parseNoticeSetting(await bodyOf(request));
  if (!setting) return json({ error: 'invalid_setting' }, { status: 400 });
  await writeNoticeSetting(env, subject.documentId, subject.ownerId, setting, Date.now());
  console.info(
    `[text-document-notices] setting saved from an email doc=${subject.documentId} comments=${setting.comments} edits=${setting.edits} one-click=${request.method === 'POST'}`,
  );
  return answer(setting);
}
