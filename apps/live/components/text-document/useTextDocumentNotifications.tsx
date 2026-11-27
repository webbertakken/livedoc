'use client';

// Tools > Notification settings (docs/specs/034-text-documents/review.md "Notifications"): bound only where it can
// apply (a signed-in account on a stored document, where email is configured), so the item is absent elsewhere,
// never dimmed. The menu's level keeps it from a Viewer.
import { useCallback, useMemo, useState } from 'react';
import { noticeSettingType, type NoticeSettingDto } from '@livedoc/api-schema';
import {
  apiReadNoticeSetting,
  apiWriteNoticeSetting,
  type NoticeSettingPlace,
} from '@/lib/api/notification-settings';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { TextDocumentNotificationsDialog } from './TextDocumentNotificationsDialog';

export const NOTIFICATION_SETTINGS_ITEM = 'notification-settings';

export function useTextDocumentNotifications({
  place,
  offered,
  onClosed,
}: {
  place: NoticeSettingPlace;
  /** Signed in, stored, and email configured. */
  offered: boolean;
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { ownerId, documentId, shareCode } = place;
  const actions = useMemo(
    (): OfficeActions =>
      offered ? { [NOTIFICATION_SETTINGS_ITEM]: { run: () => setOpen(true) } } : {},
    [offered],
  );
  const read = useCallback(
    () => apiReadNoticeSetting({ ownerId, documentId, shareCode }),
    [ownerId, documentId, shareCode],
  );
  const write = useCallback(
    (setting: NoticeSettingDto) =>
      apiWriteNoticeSetting({ ownerId, documentId, shareCode }, setting),
    [ownerId, documentId, shareCode],
  );
  const close = () => {
    setOpen(false);
    onClosed();
  };
  const dialog = open ? (
    <TextDocumentNotificationsDialog
      read={read}
      write={write}
      onKeeping={(setting) => {
        // Counted before it is kept, as every settings flip is: the two choices, never who or which document.
        track('Document', 'Changed', `TextDocumentNotices${noticeSettingType(setting)}`);
        debugLog('[text-document] notification settings', setting);
      }}
      onClose={close}
    />
  ) : null;
  return { actions, dialog };
}
