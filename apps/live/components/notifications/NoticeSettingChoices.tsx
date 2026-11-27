'use client';

// A text document's notification setting as two radio groups, Comments and Edits, in Google Docs' words
// (docs/specs/034-text-documents/review.md "Notifications"): Tools > Notification settings and an email's settings link
// draw the same choices.
import { useId } from 'react';
import type { NoticeCommentChoice, NoticeEditChoice, NoticeSettingDto } from '@livedoc/api-schema';

const COMMENT_CHOICES: readonly { value: NoticeCommentChoice; label: string }[] = [
  { value: 'all', label: 'All comments' },
  { value: 'for-you', label: 'Comments for you' },
  { value: 'none', label: 'None' },
];
const EDIT_CHOICES: readonly { value: NoticeEditChoice; label: string }[] = [
  { value: 'added-or-removed', label: 'Added or removed content' },
  { value: 'none', label: 'None' },
];

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

export function NoticeSettingChoices({
  setting,
  disabled,
  onChange,
}: {
  setting: NoticeSettingDto;
  disabled: boolean;
  onChange: (setting: NoticeSettingDto) => void;
}) {
  return (
    <>
      <ChoiceGroup
        legend="Comments"
        choices={COMMENT_CHOICES}
        chosen={setting.comments}
        disabled={disabled}
        onChoose={(comments) => onChange({ ...setting, comments })}
      />
      <ChoiceGroup
        legend="Edits"
        choices={EDIT_CHOICES}
        chosen={setting.edits}
        disabled={disabled}
        onChoose={(edits) => onChange({ ...setting, edits })}
      />
    </>
  );
}
