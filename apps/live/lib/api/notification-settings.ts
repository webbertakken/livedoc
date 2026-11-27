// A person's notification setting for a document (docs/specs/034-text-documents/review.md "Notifications"): read and
// kept by the api, by account, through the link the session holds.
import type { NoticeLinkDto, NoticeSettingDto } from '@livedoc/api-schema';
import { API_BASE, apiFetch, apiHeaders, expectOk, expectOkOrNull } from './core';

/** Where the setting is: the document, read as the session's owner through its link. */
export type NoticeSettingPlace = {
  readonly ownerId: string;
  readonly documentId: string;
  readonly shareCode: string | null;
};

const settingsUrl = (place: NoticeSettingPlace) =>
  `${API_BASE}/documents/${encodeURIComponent(place.documentId)}/notification-settings`;

/** The person's setting for the document, or the defaults. */
export async function apiReadNoticeSetting(place: NoticeSettingPlace): Promise<NoticeSettingDto> {
  const headers = await apiHeaders(place.ownerId, { share: place.shareCode });
  const res = await apiFetch(settingsUrl(place), { method: 'GET', headers });
  return expectOk<NoticeSettingDto>(res, 'notification settings');
}

/** Keeps the person's setting for the document. */
export async function apiWriteNoticeSetting(
  place: NoticeSettingPlace,
  setting: NoticeSettingDto,
): Promise<NoticeSettingDto> {
  const headers = await apiHeaders(place.ownerId, { share: place.shareCode });
  const res = await apiFetch(settingsUrl(place), {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(setting),
  });
  return expectOk<NoticeSettingDto>(res, 'notification settings');
}

// A text document email's signed settings link (review.md "Notifications", In every email). No identity headers: the
// token is the only credential, and it changes one person's setting for one document. Null = the link names nothing.
const linkUrl = (token: string) => `${API_BASE}/notification-links/${encodeURIComponent(token)}`;

/** Read only: the document's name and the setting the link names. Never writes. */
export async function apiReadNoticeLink(token: string): Promise<NoticeLinkDto | null> {
  return expectOkOrNull<NoticeLinkDto>(await apiFetch(linkUrl(token)), 'notification link');
}

/** Keeps a setting through the link: the page's one click. */
export async function apiWriteNoticeLink(
  token: string,
  setting: NoticeSettingDto,
): Promise<NoticeLinkDto | null> {
  return expectOkOrNull<NoticeLinkDto>(
    await apiFetch(linkUrl(token), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setting),
    }),
    'notification link',
  );
}
