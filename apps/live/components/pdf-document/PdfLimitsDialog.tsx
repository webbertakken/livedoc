'use client';

// The permissions password's dialog (docs/specs/035-pdf-documents/opening.md "Passwords"): the shell's dialog that
// gives the engine the permissions password. A password that lifts less than every limit is said in the dialog, tied to
// its field, which keeps focus with what was typed selected. The password goes to the engine only.
import { useEffect, useId, useRef, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { PDF_LIMITS_COPY } from '@/lib/pdf-document/pdf-limits';

export function PdfLimitsDialog({
  liftLimits,
  onClose,
}: {
  liftLimits: (password: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (wrong === 0) return;
    field.current?.focus();
    field.current?.select();
  }, [wrong]);

  const enter = async () => {
    setChecking(true);
    const lifted = await liftLimits(password);
    setChecking(false);
    if (lifted) onClose();
    else setWrong((n) => n + 1);
  };

  return (
    <OfficeDialog
      open
      onClose={onClose}
      title={PDF_LIMITS_COPY.title}
      primary={{
        label: 'Enter',
        onPress: () => void enter(),
        disabled: !password || checking,
      }}
    >
      <p className="mb-3 text-sm">{PDF_LIMITS_COPY.line}</p>
      <label className="sr-only" htmlFor={`${id}-field`}>
        {PDF_LIMITS_COPY.title}
      </label>
      <input
        ref={field}
        id={`${id}-field`}
        type="password"
        autoComplete="off"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={wrong > 0 || undefined}
        aria-describedby={wrong > 0 ? `${id}-wrong` : undefined}
        className="h-8 w-full rounded border border-(--office-line) bg-transparent px-2 text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-invalid:border-(--office-error)"
      />
      {wrong > 0 ? (
        <p
          key={wrong}
          id={`${id}-wrong`}
          role="alert"
          className="mt-2 text-sm text-(--office-error)"
        >
          {PDF_LIMITS_COPY.wrong}
        </p>
      ) : null}
    </OfficeDialog>
  );
}
