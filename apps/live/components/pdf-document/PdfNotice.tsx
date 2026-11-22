'use client';

// What fills the pages' place when there are no pages to show (docs/specs/035-pdf-documents/opening.md "Refusals",
// "Keyboard and accessibility"): one sentence as the region's heading, then what can still be done.
import type { ReactNode } from 'react';
import { Button } from '@livedoc/ui';

export function PdfNotice({
  sentence,
  role = 'region',
  children,
}: {
  sentence: string;
  // `alert` for what went wrong on the way; a refusal is a region a person reads.
  role?: 'region' | 'alert';
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-6 py-16">
      <section
        role={role}
        aria-labelledby="pdf-notice-sentence"
        className="max-w-md text-center text-(--office-ink)"
      >
        <h2 id="pdf-notice-sentence" className="text-sm font-normal">
          {sentence}
        </h2>
        {children ? <div className="mt-4 flex justify-center gap-2">{children}</div> : null}
      </section>
    </div>
  );
}

export function PdfNoticeButton({ onClick, children }: { onClick: () => void; children: string }) {
  return <Button onClick={onClick}>{children}</Button>;
}
