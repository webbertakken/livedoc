// A person's notification setting for a document (docs/specs/034-text-documents/review.md "Notifications"):
//   GET  /api/documents/<id>/notification-settings   the caller's setting, or the defaults
//   PUT  /api/documents/<id>/notification-settings   keep it ({ comments, edits })
// Only a signed-in account (a guest has no address), only where email is configured, and only at Participant level
// or above: a Viewer is never emailed, so is never offered a setting.
import { parseNoticeSetting, type NoticeSettingDto } from '@livedoc/api-schema';
import { getDocumentMeta } from '../db/documents';
import { readNoticeSetting, writeNoticeSetting } from '../db/text-document-notice-settings';
import { emailEnabled } from '../email/client';
import { json } from '../responses';
import {
  deniedParticipate,
  gateParticipate,
  missingDocument,
  type DocumentRouteContext,
} from './context';

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleTextDocumentNoticeRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request, env } = ctx;
  if (segments.length !== 4 || segments[3] !== 'notification-settings') return null;
  if (request.method !== 'GET' && request.method !== 'PUT') return null;
  const documentId = segments[2]!;
  const accountId = ctx.verifiedAccountId;
  if (!accountId) return json({ error: 'account_required' }, { status: 403 });
  if (!emailEnabled(env)) return json({ error: 'email_off' }, { status: 404 });
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateParticipate(ctx, documentId, meta.ownerId, meta.teamId)))
    return deniedParticipate(ctx, meta);

  if (request.method === 'GET') {
    const setting: NoticeSettingDto = await readNoticeSetting(env, documentId, accountId);
    return json(setting);
  }
  const setting = parseNoticeSetting(await bodyOf(request));
  if (!setting) return json({ error: 'invalid_setting' }, { status: 400 });
  await writeNoticeSetting(env, documentId, accountId, setting, Date.now());
  console.info(
    `[text-document-notices] setting saved doc=${documentId} comments=${setting.comments} edits=${setting.edits}`,
  );
  return json(setting);
}
