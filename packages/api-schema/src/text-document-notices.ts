// A text document's notification setting on the wire (docs/specs/034-text-documents/review.md "Notifications"): what
// one person hears of one document by email, as Google Docs' Tools > Notification settings.

export const NOTICE_COMMENT_CHOICES = ['all', 'for-you', 'none'] as const;
export const NOTICE_EDIT_CHOICES = ['added-or-removed', 'none'] as const;

export type NoticeCommentChoice = (typeof NOTICE_COMMENT_CHOICES)[number];
export type NoticeEditChoice = (typeof NOTICE_EDIT_CHOICES)[number];

/** The setting: GET and PUT /api/documents/<id>/notification-settings. */
export type NoticeSettingDto = { comments: NoticeCommentChoice; edits: NoticeEditChoice };

/** A person with no setting for a document: comments for you, no edits (Google's defaults). */
export const DEFAULT_NOTICE_SETTING: NoticeSettingDto = { comments: 'for-you', edits: 'none' };

const isOneOf = <T extends string>(choices: readonly T[], value: unknown): value is T =>
  choices.includes(value as T);

/** The setting a body names, or null when it names anything else. */
export function parseNoticeSetting(value: unknown): NoticeSettingDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { comments, edits } = value as Record<string, unknown>;
  if (!isOneOf(NOTICE_COMMENT_CHOICES, comments) || !isOneOf(NOTICE_EDIT_CHOICES, edits))
    return null;
  return { comments, edits };
}

const COMMENT_TYPES: Record<NoticeCommentChoice, string> = {
  all: 'All',
  'for-you': 'ForYou',
  none: 'None',
};
const EDIT_TYPES: Record<NoticeEditChoice, string> = {
  'added-or-removed': 'AddedOrRemoved',
  none: 'None',
};

/** The pair as a telemetry type (`TextDocument · NotificationSettingsChanged`), never who or which document. */
export function noticeSettingType(setting: NoticeSettingDto): string {
  return COMMENT_TYPES[setting.comments] + EDIT_TYPES[setting.edits];
}
