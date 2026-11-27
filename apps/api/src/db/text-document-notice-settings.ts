// A text document's notification setting per person (docs/specs/034-text-documents/review.md "Notifications"): what
// one account hears of one document by email. No row means the defaults; a row the schema would refuse reads as
// none, so a bad row can never widen what someone is sent.
import {
  DEFAULT_NOTICE_SETTING,
  parseNoticeSetting,
  type NoticeSettingDto,
} from '@livedoc/api-schema';
import type { Env } from '../types';

type SettingRow = { owner_id: string; comments: string; edits: string };

/** One person's setting for a document, or the defaults. */
export async function readNoticeSetting(
  env: Env,
  documentId: string,
  ownerId: string,
): Promise<NoticeSettingDto> {
  const row = await env.DB.prepare(
    'SELECT owner_id, comments, edits FROM text_document_notice_settings WHERE document_id = ? AND owner_id = ?',
  )
    .bind(documentId, ownerId)
    .first<SettingRow>();
  return (row && parseNoticeSetting(row)) ?? DEFAULT_NOTICE_SETTING;
}

/** Keeps one person's setting for a document, replacing any before it. */
export async function writeNoticeSetting(
  env: Env,
  documentId: string,
  ownerId: string,
  setting: NoticeSettingDto,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO text_document_notice_settings (document_id, owner_id, comments, edits, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (document_id, owner_id) DO UPDATE SET
       comments = excluded.comments, edits = excluded.edits, updated_at = excluded.updated_at`,
  )
    .bind(documentId, ownerId, setting.comments, setting.edits, now)
    .run();
}

export type PersonNoticeSetting = NoticeSettingDto & { readonly ownerId: string };

/** Every setting kept for a document, by person: who chose anything other than the defaults. */
export async function noticeSettingsOf(
  env: Env,
  documentId: string,
): Promise<PersonNoticeSetting[]> {
  const { results } = await env.DB.prepare(
    'SELECT owner_id, comments, edits FROM text_document_notice_settings WHERE document_id = ? ORDER BY owner_id',
  )
    .bind(documentId)
    .all<SettingRow>();
  return (results ?? []).flatMap((row) => {
    const setting = parseNoticeSetting(row);
    return setting ? [{ ownerId: row.owner_id, ...setting }] : [];
  });
}
