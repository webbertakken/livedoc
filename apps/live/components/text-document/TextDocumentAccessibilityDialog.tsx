'use client';

// Tools > Accessibility (docs/specs/034-text-documents/tools.md "Accessibility settings", The dialog): Turn on screen
// reader support, acting as it is ticked; then the sentence that braille displays and magnifiers need nothing turned
// on, read in the tab order (never a dimmed checkbox: a disabled control is skipped or read as unavailable); OK closes.
// The look is (default) until a capture of Google's dialog.
import { Button } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { NATIVE_SUPPORT_SENTENCE } from '@/lib/text-document/text-document-screen-reader';

export function TextDocumentAccessibilityDialog({
  screenReader,
  onScreenReader,
  onClose,
}: {
  screenReader: boolean;
  onScreenReader: (on: boolean) => void;
  onClose: () => void;
}) {
  return (
    <OfficeDialog open onClose={onClose} title="Accessibility settings">
      <div className="flex flex-col gap-4 pt-1">
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            className="size-icon-row shrink-0 accent-(--office-primary)"
            checked={screenReader}
            onChange={(event) => onScreenReader(event.target.checked)}
          />
          Turn on screen reader support
        </label>
        {/* Focusable so Tab reaches it and a screen reader reads it in turn; it does nothing on a press. */}
        <p
          tabIndex={0}
          className="rounded-control text-body text-(--office-muted) focus-visible:outline-2 focus-visible:outline-(--office-primary)"
        >
          {NATIVE_SUPPORT_SENTENCE}
        </p>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>OK</Button>
        </div>
      </div>
    </OfficeDialog>
  );
}
