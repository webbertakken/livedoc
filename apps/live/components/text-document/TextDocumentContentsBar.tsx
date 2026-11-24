'use client';

// The bar above a selected table of contents (docs/specs/034-text-documents/links-and-navigation.md "Table of
// contents"): Update table of contents and Table of contents options, a toolbar reached from the block with Alt+F10;
// arrows move along it, Escape goes back to the writing.
import type { KeyboardEvent } from 'react';
import { RefreshIcon, SettingsIcon, Tooltip } from '@livedoc/ui';

const BUTTON =
  'flex size-row items-center justify-center rounded-control text-(--office-icon) hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-(--office-focus)';

export function TextDocumentContentsBar({
  onUpdate,
  onOptions,
  onBack,
}: {
  onUpdate: () => void;
  onOptions: () => void;
  /** Escape: back to the writing, the block still selected. */
  onBack: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onBack();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button')];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label="Table of contents"
      onKeyDown={onKeyDown}
      className="office-shell flex items-center gap-0.5 rounded-menu border border-(--office-line) bg-(--office-menu) p-0.5 shadow-sm"
    >
      <Tooltip label="Update table of contents">
        <button
          type="button"
          aria-label="Update table of contents"
          className={BUTTON}
          onClick={onUpdate}
        >
          <RefreshIcon size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Table of contents options">
        <button
          type="button"
          aria-label="Table of contents options"
          className={BUTTON}
          onClick={onOptions}
        >
          <SettingsIcon size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
