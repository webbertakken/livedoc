'use client';

// What fills the pages' place when there are no pages to show (docs/specs/035-pdf-documents/opening.md "Refusals",
// "Keyboard and accessibility"): a glyph, one sentence as the region's heading, the second line, then what can still
// be done. The glyph is never the only thing that says it.
import { useId, type ReactNode } from 'react';
import type { IconPrim } from '@livedoc/icons';
import { Button, Glyph, Prims } from '@livedoc/ui';

export function PdfNotice({
  sentence,
  then = null,
  glyph,
  role = 'region',
  children,
}: {
  sentence: string;
  then?: string | null;
  glyph?: readonly IconPrim[];
  // `alert` for what went wrong on the way; a refusal is a region a person reads.
  role?: 'region' | 'alert';
  children?: ReactNode;
}) {
  const heading = useId();
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-6 py-16">
      <section
        role={role}
        aria-labelledby={heading}
        className="flex max-w-md flex-col items-center text-center text-(--office-ink)"
      >
        {glyph ? (
          <Glyph size={32} units={24} aria-hidden="true" className="mb-3 text-(--office-muted)">
            <Prims prims={glyph} />
          </Glyph>
        ) : null}
        <h2 id={heading} className="text-body font-normal">
          {sentence}
        </h2>
        {then ? <p className="mt-1 text-body text-(--office-muted)">{then}</p> : null}
        {children ? (
          <div className="mt-4 flex w-full flex-wrap justify-center gap-2">{children}</div>
        ) : null}
      </section>
    </div>
  );
}

export function PdfNoticeButton({
  onClick,
  variant,
  children,
}: {
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  children: string;
}) {
  return (
    <Button onClick={onClick} variant={variant}>
      {children}
    </Button>
  );
}
