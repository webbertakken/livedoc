'use client';

// The office shell's dialog (docs/specs/004-interface-design/office-shell.md "Dialogs"): the app's modal, drawn in the
// shell's look tokens, with the title and its × on top and Cancel and the primary at the bottom right. Below the
// phone breakpoint it fills the screen, the × leads the top bar and the primary sits at its right.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';

export type OfficeDialogPrimary = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

// Where focus starts: the body's first field or control, else the primary (never the ×, which leads in the markup).
const START =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]';

const PANEL =
  'office-shell relative border-(--office-line) bg-(--office-dialog) text-(--office-ink)';

const PILL =
  'touch-target relative inline-flex h-prominent items-center rounded-full px-6 text-body outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--office-dialog)';

export function OfficeDialog({
  open,
  onClose,
  title,
  wide = false,
  primary,
  secondary,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  // 720 px, for a dialog that lists or compares (Keyboard shortcuts); 480 px otherwise.
  wide?: boolean;
  // What the dialog confirms; Cancel comes with it. None: the dialog only shows, and its × closes it.
  primary?: OfficeDialogPrimary;
  // An action that changes only the dialog (Reset), at the footer's start.
  secondary?: { label: string; onPress: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  const titleId = useId();
  const form = useRef<HTMLFormElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  // After the modal's own focus trap has placed focus (its effect runs first, as a child's does). On a touch screen
  // the trap keeps it on the panel, so no on-screen keyboard rises for a field nobody tapped.
  useEffect(() => {
    if (!open || window.matchMedia?.('(pointer: coarse)').matches) return;
    const start =
      body.current?.querySelector<HTMLElement>(START) ??
      form.current?.querySelector<HTMLElement>('button[type="submit"]:not([disabled])');
    start?.focus({ preventScroll: true });
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      size={wide ? 'wide' : 'md'}
      surface={PANEL}
      className="max-h-[calc(100dvh-2rem)] overflow-hidden"
    >
      <form
        ref={form}
        className="flex min-h-0 flex-1 flex-col"
        // Enter in a one-line field runs the primary, as a form's default button.
        onSubmit={(e) => {
          e.preventDefault();
          if (primary && !primary.disabled) primary.onPress();
        }}
      >
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 max-sm:min-h-14 max-sm:border-b max-sm:border-(--office-line) max-sm:px-2 max-sm:py-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-dialog-title max-sm:text-name">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="touch-target relative -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) max-sm:order-first max-sm:mr-0"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <div ref={body} className="flex min-h-0 flex-1 flex-col px-6 pb-6 max-sm:px-4 max-sm:pt-3">
          {children}
        </div>
        {primary ? (
          <div className="flex justify-end gap-2 px-6 pb-6 max-sm:absolute max-sm:top-2.5 max-sm:right-2 max-sm:p-0">
            {secondary ? (
              <button
                type="button"
                onClick={secondary.onPress}
                disabled={secondary.disabled}
                className={`${PILL} border border-(--office-line) text-(--office-primary) hover:bg-(--office-hover) disabled:opacity-40 disabled:hover:bg-transparent sm:mr-auto max-sm:border-0 max-sm:px-3`}
              >
                <span className="text-optical-centre">{secondary.label}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={`${PILL} text-(--office-primary) hover:bg-(--office-hover) max-sm:hidden`}
            >
              <span className="text-optical-centre">Cancel</span>
            </button>
            <button
              type="submit"
              disabled={primary.disabled}
              className={`${PILL} bg-(--office-primary) text-(--office-primary-ink) font-medium disabled:opacity-40`}
            >
              <span className="text-optical-centre">{primary.label}</span>
            </button>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
