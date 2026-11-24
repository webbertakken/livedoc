'use client';

// The bar under a selected drawing's picture (docs/specs/034-text-documents/objects.md "The picture's bar"): Edit for
// whoever may edit, Open for anyone else; reached from the picture with Alt+F10, Escape going back to the writing.
import type { KeyboardEvent } from 'react';

export function TextDocumentPictureBar({
  canEdit,
  onOpen,
  onBack,
}: {
  canEdit: boolean;
  onOpen: () => void;
  /** Escape: back to the writing, the picture still selected. */
  onBack: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onBack();
  };
  return (
    <div
      role="toolbar"
      aria-label="Drawing"
      onKeyDown={onKeyDown}
      className="office-shell flex items-center gap-0.5 rounded-control border border-(--office-line) bg-(--office-menu) p-0.5 shadow-sm"
    >
      <button
        type="button"
        className="h-row rounded-control px-3 text-body font-medium text-(--office-ink) hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus)"
        // The press is the bar's: the picture stays selected.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpen}
      >
        {canEdit ? 'Edit' : 'Open'}
      </button>
    </div>
  );
}
