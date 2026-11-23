'use client';

// The notice bar under a PDF's toolbar (docs/specs/035-pdf-documents/reading-surface.md "Notices"): an info glyph, one
// sentence about the file, its action, and Dismiss for this open; a polite status, in the shell's tokens.
import { lucideInfo, lucideX } from '@livedoc/icons/lucide';
import { Glyph, Prims, Tooltip } from '@livedoc/ui';

export function PdfNoticeBar({
  sentence,
  action,
  onAction,
  onDismiss,
}: {
  sentence: string;
  action: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      data-region="notice"
      className="flex min-h-10 items-center gap-3 border-b border-(--office-line) bg-(--office-toolbar) px-4 py-1.5 text-sm text-(--office-ink)"
    >
      <Glyph size={16} units={24} aria-hidden="true" className="shrink-0 text-(--office-icon)">
        <Prims prims={lucideInfo} />
      </Glyph>
      <p className="min-w-0 flex-1">{sentence}</p>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded px-2 py-1 font-medium text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
      >
        {action}
      </button>
      <Tooltip label="Dismiss">
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-7 shrink-0 items-center justify-center rounded text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
        >
          <Glyph size={16} units={24} aria-hidden="true">
            <Prims prims={lucideX} />
          </Glyph>
        </button>
      </Tooltip>
    </div>
  );
}
