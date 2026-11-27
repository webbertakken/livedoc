'use client';

// The version history's dialogs (docs/specs/034-text-documents/review.md "Version history"): File > Version history >
// Name current version, a name for the document as it is now, the time as its placeholder, a refusal said in it while
// it stays open, Save waiting for a name; and Restore this version, asked once before the document reverts (default copy, after Google's).
import { useId, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';

export const RESTORE_VERSION_TITLE = 'Restore this version?';
export const RESTORE_VERSION_TEXT =
  'Your current document will revert to this version. You can always restore the current version later.';

export function NameCurrentVersionDialog({
  placeholder,
  maxLength,
  error,
  busy,
  onSave,
  onClose,
}: {
  /** The time now, as the field's placeholder. */
  placeholder: string;
  maxLength: number;
  /** A refusal, said in the dialog; null when there is none. */
  error: string | null;
  /** A save under way: Save waits. */
  busy: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Name current version"
      // Save waits for a name (default).
      primary={{
        label: 'Save',
        onPress: () => onSave(name.trim()),
        disabled: busy || !name.trim(),
      }}
    >
      <label htmlFor={id} className="sr-only">
        Version name
      </label>
      <input
        id={id}
        type="text"
        value={name}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => setName(event.target.value)}
        className="h-field w-full rounded-control border border-(--office-line) bg-transparent px-3 text-body outline-none placeholder:text-(--office-muted) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
      />
      {error ? (
        <p role="alert" className="mt-2 text-body text-(--office-ink)">
          {error}
        </p>
      ) : null}
    </OfficeDialog>
  );
}

export function RestoreVersionDialog({
  busy,
  onRestore,
  onClose,
}: {
  busy: boolean;
  onRestore: () => void;
  onClose: () => void;
}) {
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title={RESTORE_VERSION_TITLE}
      primary={{ label: 'Restore', onPress: onRestore, disabled: busy }}
    >
      <p className="text-body">{RESTORE_VERSION_TEXT}</p>
    </OfficeDialog>
  );
}

/** A version's Make a copy: the copy's name, "Copy of <title>" to start with (default copy, after Google's). */
export function VersionCopyDialog({
  initial,
  maxLength,
  error,
  busy,
  onCopy,
  onClose,
}: {
  initial: string;
  maxLength: number;
  /** A failure, said in the dialog; null when there is none. */
  error: string | null;
  busy: boolean;
  onCopy: (name: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Copy document"
      primary={{
        label: 'Make a copy',
        onPress: () => onCopy(name.trim()),
        disabled: busy || !name.trim(),
      }}
    >
      <label htmlFor={id} className="mb-1 block text-body">
        Name
      </label>
      <input
        id={id}
        type="text"
        value={name}
        maxLength={maxLength}
        onChange={(event) => setName(event.target.value)}
        className="h-field w-full rounded-control border border-(--office-line) bg-transparent px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
      />
      {error ? (
        <p role="alert" className="mt-2 text-body text-(--office-ink)">
          {error}
        </p>
      ) : null}
    </OfficeDialog>
  );
}
