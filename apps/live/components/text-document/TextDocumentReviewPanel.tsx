'use client';

// The Suggested edits panel (docs/specs/034-text-documents/review.md "Reviewing suggestions"): Google's box in the top
// right, non-modal: the whole document's count (each tab's in a document of tabs), Previous and Next, the Preview
// choice with why the document is read only while previewing, and Accept all and Reject all (or Reject all mine) as
// the person may.
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { Button, ChevronLeftIcon, ChevronRightIcon, CloseIcon, Select, Tooltip } from '@livedoc/ui';
import { reviewCountLine, type ReviewCount } from '@/lib/text-document/text-document-review';
import { CardButton } from './TextDocumentLinkCard';
import type { ReviewOffers } from './useTextDocumentReviewPanel';
import type { ReviewPreview } from './useTextDocumentReviewPreview';

const PREVIEWS: readonly [ReviewPreview, string][] = [
  ['show', 'Show suggested edits'],
  ['accept-all', 'Preview accept all'],
  ['reject-all', 'Preview reject all'],
];

/** Why the body takes no edits while previewing (default copy). */
export const REVIEW_PREVIEW_NOTE =
  'Previewing: the document can’t be edited until you choose Show suggested edits or close this panel.';

export function TextDocumentReviewPanel({
  count,
  offers,
  mode,
  onMode,
  onStep,
  onAcceptAll,
  onRejectAll,
  onClose,
}: {
  count: ReviewCount;
  offers: ReviewOffers;
  mode: ReviewPreview;
  onMode: (mode: ReviewPreview) => void;
  onStep: (forward: boolean) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
}) {
  const title = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Opened, the panel takes the keyboard (review.md "Reviewing suggestions").
  useEffect(() => panel.current?.focus(), []);
  const previewing = mode !== 'show';
  const none = count.total === 0;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="absolute top-4 right-4 z-30 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2 rounded-menu border border-(--office-line) bg-(--office-menu) p-3 text-body text-(--office-ink) shadow-lg outline-none"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={title} className="text-body font-medium">
          Suggested edits
        </h2>
        <CardButton label="Close" onPress={onClose}>
          <CloseIcon />
        </CardButton>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-(--office-muted)">
          {reviewCountLine(count.total)}
        </p>
        <div className="flex items-center gap-1">
          <StepButton
            label="Previous suggested edit"
            disabled={none || previewing}
            onPress={() => onStep(false)}
          >
            <ChevronLeftIcon />
          </StepButton>
          <StepButton
            label="Next suggested edit"
            disabled={none || previewing}
            onPress={() => onStep(true)}
          >
            <ChevronRightIcon />
          </StepButton>
        </div>
      </div>
      {count.tabs.length > 1 && (
        <ul
          aria-label="Suggested edits by tab"
          className="flex flex-col gap-0.5 text-(--office-muted)"
        >
          {count.tabs.map((t) => (
            <li key={t.id}>{`${t.name}: ${t.count}`}</li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-(--office-muted)">Preview</span>
        <Select
          size="sm"
          aria-label="Preview"
          value={mode}
          onChange={(event) => onMode(event.target.value as ReviewPreview)}
        >
          {PREVIEWS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      {previewing && <p className="text-(--office-muted)">{REVIEW_PREVIEW_NOTE}</p>}
      {(offers.accept || offers.reject) && (
        <div className="flex justify-end gap-2">
          {offers.reject && (
            <Button size="xs" variant="secondary" disabled={none} onClick={onRejectAll}>
              {offers.reject === 'mine' ? 'Reject all mine' : 'Reject all'}
            </Button>
          )}
          {offers.accept && (
            <Button size="xs" disabled={none} onClick={onAcceptAll}>
              Accept all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** An arrow: a CardButton that may be disabled (a disabled button is skipped by the keyboard). */
function StepButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onPress}
        className="grid size-row shrink-0 place-items-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none disabled:opacity-40"
      >
        {children}
      </button>
    </Tooltip>
  );
}
