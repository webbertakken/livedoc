'use client';

// The open password's screen (docs/specs/035-pdf-documents/opening.md "Passwords", "Keyboard and accessibility"): on
// the pages' place, never a browser prompt. The field takes focus; Enter opens; a wrong password is said, tied to the
// field and announced, and the field keeps focus with what was typed selected. The password goes to the engine only.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { lucideLock } from '@livedoc/icons/lucide';
import { Button } from '@livedoc/ui';
import { PDF_PASSWORD_COPY } from '@/lib/pdf-document/pdf-refusals';
import { PdfNotice, PdfNoticeButton } from './PdfNotice';

export function PdfPasswordScreen({
  tries,
  unlock,
  onDownload,
}: {
  /** How many passwords given so far did not open the file. */
  tries: number;
  unlock: (password: string) => Promise<void>;
  onDownload: () => void;
}) {
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const wrongLine = useId();

  // On showing, and after each wrong password: focus in the field, what was typed selected to be typed over.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [tries]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    try {
      await unlock(password);
    } finally {
      setChecking(false);
    }
  };

  const wrong = tries > 0;
  return (
    <PdfNotice
      sentence={PDF_PASSWORD_COPY.sentence}
      then={PDF_PASSWORD_COPY.then}
      glyph={lucideLock}
    >
      <form
        className="flex w-full max-w-xs flex-col gap-2"
        onSubmit={(event) => void submit(event)}
      >
        <label className="sr-only" htmlFor={`${wrongLine}-field`}>
          Password
        </label>
        <div className="flex gap-2">
          <input
            ref={field}
            id={`${wrongLine}-field`}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={wrong || undefined}
            aria-describedby={wrong ? wrongLine : undefined}
            className="h-8 min-w-0 flex-1 rounded border pointer-coarse:h-11 pointer-coarse:text-base border-(--office-line) bg-transparent px-2 text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-invalid:border-(--office-error)"
          />
          <Button type="submit" disabled={!password || checking}>
            Open
          </Button>
        </div>
        {wrong ? (
          <p
            key={tries}
            id={wrongLine}
            role="alert"
            className="text-left text-sm text-(--office-error)"
          >
            {PDF_PASSWORD_COPY.wrong}
          </p>
        ) : null}
      </form>
      <PdfNoticeButton variant="secondary" onClick={onDownload}>
        Download
      </PdfNoticeButton>
    </PdfNotice>
  );
}
