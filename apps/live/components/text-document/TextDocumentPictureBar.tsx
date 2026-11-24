'use client';

// The bar under a selected picture (docs/specs/034-text-documents/objects.md "The picture's bar"), look and order
// (default) until a capture: a drawing's Edit (Open for anyone who cannot edit) first; then, for whoever may edit, the
// five Text wrapping choices, the one in force pressed, and Image options. Reached from the picture with Alt+F10; Left
// and Right move along it; Escape goes back to the writing, the picture still selected.
import type { KeyboardEvent } from 'react';
import { EllipsisIcon, Tooltip } from '@livedoc/ui';
import {
  PICTURE_WRAP_CHOICES,
  type PictureWrapChoice,
} from '@/lib/text-document/text-document-picture-placing';
import { PictureWrapGlyph } from './picture-wrap-glyphs';

export const IMAGE_OPTIONS_LABEL = 'Image options';

const TEXT_BUTTON =
  'h-row rounded-control px-3 text-body text-(--office-ink) hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus)';
const ICON_BUTTON =
  'grid size-row place-items-center rounded-control text-(--office-icon) hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus) aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink)';

// A press on the bar is the bar's: the picture stays selected.
const keepSelection = (e: { preventDefault: () => void }) => e.preventDefault();

export type PictureBarDrawing = { canEdit: boolean; onOpen: () => void };
export type PictureBarWrapping = {
  chosen: PictureWrapChoice;
  onWrap: (choice: PictureWrapChoice) => void;
  onOptions: () => void;
};

export function TextDocumentPictureBar({
  drawing,
  wrapping,
  onBack,
}: {
  // A drawing's picture: Edit or Open.
  drawing: PictureBarDrawing | null;
  // Whoever may edit: the wraps and Image options.
  wrapping: PictureBarWrapping | null;
  /** Escape: back to the writing, the picture still selected. */
  onBack: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onBack();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label={drawing ? 'Drawing' : 'Image'}
      onKeyDown={onKeyDown}
      className="office-shell flex items-center gap-0.5 rounded-menu border border-(--office-line) bg-(--office-menu) p-0.5 shadow-sm"
    >
      {drawing ? (
        <button
          type="button"
          className={TEXT_BUTTON}
          onMouseDown={keepSelection}
          onClick={drawing.onOpen}
        >
          {drawing.canEdit ? 'Edit' : 'Open'}
        </button>
      ) : null}
      {drawing && wrapping ? (
        <span aria-hidden="true" className="mx-1 h-icon-toolbar w-px bg-(--office-line)" />
      ) : null}
      {wrapping ? (
        <>
          {PICTURE_WRAP_CHOICES.map((choice) => (
            <Tooltip key={choice.id} label={choice.label}>
              <button
                type="button"
                aria-label={choice.label}
                aria-pressed={wrapping.chosen === choice.id}
                className={ICON_BUTTON}
                onMouseDown={keepSelection}
                onClick={() => wrapping.onWrap(choice.id)}
              >
                <PictureWrapGlyph wrap={choice.id} />
              </button>
            </Tooltip>
          ))}
          <Tooltip label={IMAGE_OPTIONS_LABEL}>
            <button
              type="button"
              aria-label={IMAGE_OPTIONS_LABEL}
              className={ICON_BUTTON}
              onMouseDown={keepSelection}
              onClick={wrapping.onOptions}
            >
              <EllipsisIcon aria-hidden />
            </button>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}
