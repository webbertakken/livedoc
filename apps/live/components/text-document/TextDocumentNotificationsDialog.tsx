'use client';

// Tools > Notification settings (docs/specs/034-text-documents/review.md "Notifications"): what this person hears of
// this document by email, comments and edits, as Google Docs' dialog. Read when it opens; nothing is kept until OK.
import { useEffect, useId, useState } from 'react';
import type { NoticeCommentChoice, NoticeEditChoice, NoticeSettingDto } from '@livedoc/api-schema';
import { OfficeDialog } from '@/components/office/OfficeDialog';

export const NOTICE_LOAD_FAILED = 'Your notification settings couldn’t be loaded. Try again.';
export const NOTICE_SAVE_FAILED = 'Your notification settings couldn’t be saved. Try again.';

const COMMENT_CHOICES: readonly { value: NoticeCommentChoice; label: string }[] = [
  { value: 'all', label: 'All comments' },
  { value: 'for-you', label: 'Comments for you' },
  { value: 'none', label: 'None' },
];
const EDIT_CHOICES: readonly { value: NoticeEditChoice; label: string }[] = [
  { value: 'added-or-removed', label: 'Added or removed content' },
  { value: 'none', label: 'None' },
];

type Step =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'choosing'; readonly refusal: string | null; readonly saving: boolean };

function ChoiceGroup<T extends string>({
  legend,
  choices,
  chosen,
  disabled,
  onChoose,
}: {
  legend: string;
  choices: readonly { value: T; label: string }[];
  chosen: T;
  disabled: boolean;
  onChoose: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="pb-2 text-body font-medium">{legend}</legend>
      {choices.map(({ value, label }) => (
        <label key={value} className="flex items-center gap-3 text-body">
          <input
            type="radio"
            name={name}
            className="size-icon-row shrink-0 accent-(--office-primary)"
            checked={chosen === value}
            onChange={() => onChoose(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

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
      <div className="flex flex-col gap-5 pt-1" aria-busy={step.kind === 'loading'}>
        <ChoiceGroup
          legend="Comments"
          choices={COMMENT_CHOICES}
          chosen={setting.comments}
          disabled={disabled}
          onChoose={(comments) => setSetting((s) => ({ ...s, comments }))}
        />
        <ChoiceGroup
          legend="Edits"
          choices={EDIT_CHOICES}
          chosen={setting.edits}
          disabled={disabled}
          onChoose={(edits) => setSetting((s) => ({ ...s, edits }))}
        />
        {step.kind === 'unread' || (choosing && step.refusal) ? (
          <p role="alert" className="text-body text-red-700 dark:text-red-300">
            {step.kind === 'unread' ? NOTICE_LOAD_FAILED : step.refusal}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
