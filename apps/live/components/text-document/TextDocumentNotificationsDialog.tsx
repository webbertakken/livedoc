'use client';

// Tools > Notification settings (docs/specs/034-text-documents/review.md "Notifications"): what this person hears of
// this document by email, comments and edits, as Google Docs' dialog. Read when it opens; nothing is kept until OK.
import { useEffect, useState } from 'react';
import type { NoticeSettingDto } from '@livedoc/api-schema';
import { NoticeSettingChoices } from '@/components/notifications/NoticeSettingChoices';
import { OfficeDialog } from '@/components/office/OfficeDialog';

export const NOTICE_LOAD_FAILED = 'Your notification settings couldn’t be loaded. Try again.';
export const NOTICE_SAVE_FAILED = 'Your notification settings couldn’t be saved. Try again.';

type Step =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'choosing'; readonly refusal: string | null; readonly saving: boolean };

export function TextDocumentNotificationsDialog({
  read,
  write,
  onKeeping,
  onClose,
}: {
  /** The person's setting as kept. */
  read: () => Promise<NoticeSettingDto>;
  /** Keeps a setting; throws when it cannot. */
  write: (setting: NoticeSettingDto) => Promise<unknown>;
  /** A setting is being kept: told before the write, as every settings flip is counted before it lands. */
  onKeeping: (setting: NoticeSettingDto) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [setting, setSetting] = useState<NoticeSettingDto>({ comments: 'for-you', edits: 'none' });
  useEffect(() => {
    let live = true;
    read().then(
      (kept) => {
        if (!live) return;
        setSetting(kept);
        setStep({ kind: 'choosing', refusal: null, saving: false });
      },
      () => {
        if (live) setStep({ kind: 'unread' });
      },
    );
    return () => {
      live = false;
    };
  }, [read]);

  const save = () => {
    setStep({ kind: 'choosing', refusal: null, saving: true });
    onKeeping(setting);
    write(setting).then(
      () => onClose(),
      () => setStep({ kind: 'choosing', refusal: NOTICE_SAVE_FAILED, saving: false }),
    );
  };
  const choosing = step.kind === 'choosing';
  const disabled = !choosing || step.saving;
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Notification settings"
      primary={{ label: 'OK', onPress: save, disabled }}
    >
      <div className="flex flex-col gap-6 pt-1" aria-busy={step.kind === 'loading'}>
        <NoticeSettingChoices setting={setting} disabled={disabled} onChange={setSetting} />
        {step.kind === 'unread' || (choosing && step.refusal) ? (
          <p role="alert" className="text-body text-red-700 dark:text-red-300">
            {step.kind === 'unread' ? NOTICE_LOAD_FAILED : step.refusal}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
