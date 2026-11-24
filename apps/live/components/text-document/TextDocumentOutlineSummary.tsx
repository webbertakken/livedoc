'use client';

// The outline's summary (docs/specs/034-text-documents/links-and-navigation.md "The summary"): titled Summary, its
// text under the title with its line breaks; an Editor adds it with + or changes it with Edit summary, in a field in
// place kept on leaving or Ctrl+Enter, Escape keeping the old text. Anyone else sees it only while it has text.
import { useRef, useId, type KeyboardEvent } from 'react';
import { PencilIcon, PlusIcon, Tooltip } from '@livedoc/ui';
import { TEXT_DOCUMENT_SUMMARY_MAX } from '@livedoc/text-documents';
import type { TextDocumentSummary } from './useTextDocumentSummary';

export const SUMMARY_TITLE = 'Summary';
export const ADD_SUMMARY_LABEL = 'Add summary';
export const EDIT_SUMMARY_LABEL = 'Edit summary';

const ICON_BUTTON =
  'grid size-7 place-items-center rounded-full outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

function SummaryField({ summary }: { summary: TextDocumentSummary }) {
  // Escape or Ctrl+Enter has finished it: the blur as the field goes keeps nothing more.
  const done = useRef(false);
  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    summary.finish(text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finish(event.currentTarget.value);
    }
  };
  return (
    <textarea
      aria-label={SUMMARY_TITLE}
      defaultValue={summary.text}
      maxLength={TEXT_DOCUMENT_SUMMARY_MAX}
      rows={3}
      // The field takes the focus it was opened for, the caret after its text.
      ref={(field) => {
        if (field && document.activeElement !== field) {
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        }
      }}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="mx-2 block w-[calc(100%-1rem)] resize-y rounded-control border border-(--office-focus) bg-(--office-menu) px-2 py-1 text-body text-(--office-ink) outline-none"
    />
  );
}

export function TextDocumentOutlineSummary({ summary }: { summary: TextDocumentSummary }) {
  const titleId = useId();
  const { text, canEdit, editing } = summary;
  if (!text && !canEdit) return null;
  const label = text ? EDIT_SUMMARY_LABEL : ADD_SUMMARY_LABEL;
  const Icon = text ? PencilIcon : PlusIcon;
  return (
    <section aria-labelledby={titleId} className="pb-3">
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <h3 id={titleId} className="text-supporting font-medium text-(--office-muted)">
          {SUMMARY_TITLE}
        </h3>
        {canEdit && !editing && (
          <Tooltip label={label}>
            <button type="button" aria-label={label} onClick={summary.edit} className={ICON_BUTTON}>
              <Icon className="size-4" aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
      {editing ? (
        <SummaryField summary={summary} />
      ) : (
        text && <p className="px-2 text-body whitespace-pre-wrap text-(--office-ink)">{text}</p>
      )}
    </section>
  );
}
