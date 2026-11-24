'use client';

// The first-time question for Dark pages (docs/specs/035-pdf-documents/dark-pages.md "The first-time question", F13
// (default)): a card under the toolbar at the right, never a dialog. Focus stays where it is and the pages read,
// scroll and select behind it; it is said politely once. F6 reaches it as a region of its own; Escape inside it
// dismisses it and gives focus back to where it came from. It shows the open page as it is and as Dark pages would.
import { Button, Glyph, Prims, Tooltip } from '@livedoc/ui';
import { lucideX } from '@livedoc/icons/lucide';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PageLook, PageTurns, PdfEngine } from '@livedoc/pdf-documents';
import { paintPicture } from '@/lib/pdf-document/pdf-paint';
import type { DarkPagesAnswer } from '@/lib/pdf-document/usePdfDarkPagesQuestion';

/** (default) The width of each of the card's two pictures of the page, in CSS pixels. */
export const DARK_PAGES_PREVIEW_PX = 132;

function PagePicture({
  engine,
  page,
  width,
  turns,
  look,
  label,
}: {
  engine: Pick<PdfEngine, 'drawPage'>;
  page: number;
  width: number;
  turns: PageTurns;
  look: PageLook;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let gone = false;
    const scale = (DARK_PAGES_PREVIEW_PX / width) * window.devicePixelRatio;
    void engine.drawPage(page, scale, turns, undefined, look).then((bitmap) => {
      if (!gone && bitmap && canvas.current) paintPicture(canvas.current, bitmap);
    });
    return () => {
      gone = true;
    };
  }, [engine, page, width, turns, look]);
  return (
    <figure className="m-0 flex-1">
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="block w-full rounded-sm bg-(--pdf-paper) outline outline-1 outline-(--office-line)"
      />
      <figcaption className="mt-1 text-xs text-(--office-muted)">{label}</figcaption>
    </figure>
  );
}

export function PdfDarkPagesQuestion({
  engine,
  page,
  width,
  turns,
  onAnswer,
  onLeave,
}: {
  engine: Pick<PdfEngine, 'drawPage'>;
  // The page in view, by index, and its width in points: the pictures are of it.
  page: number;
  width: number;
  turns: PageTurns;
  onAnswer: (how: DarkPagesAnswer) => void;
  // Where focus goes once the card is gone, when nothing held it before.
  onLeave: () => void;
}) {
  const heading = useId();
  // Where focus was before it came into the card, given back when Escape dismisses it.
  const cameFrom = useRef<HTMLElement | null>(null);
  // Said once, a moment after it shows, so a screen reader hears it after what it was saying.
  const [said, setSaid] = useState('');
  // The live region is in the page first and its words after, so it is heard.
  useEffect(() => {
    const later = setTimeout(() => setSaid('Question: show PDF pages dark?'), 0);
    return () => clearTimeout(later);
  }, []);

  const dismiss = () => {
    onAnswer('Dismissed');
    if (cameFrom.current?.isConnected) cameFrom.current.focus();
    else onLeave();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dismiss();
  };

  return (
    <section
      data-region="question"
      aria-labelledby={heading}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from))
          cameFrom.current = from;
      }}
      className="absolute top-3 right-3 z-20 w-[22rem] max-w-[calc(100%-1.5rem)] rounded-2xl bg-(--office-dialog) p-4 text-(--office-ink) shadow-lg outline outline-1 outline-(--office-line) phone:inset-x-2 phone:w-auto phone:max-w-none"
    >
      <p role="status" className="sr-only">
        {said}
      </p>
      <div className="flex items-start gap-2">
        <h2 id={heading} className="m-0 flex-1 text-base font-semibold">
          Show PDF pages dark?
        </h2>
        <Tooltip label="Close">
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="relative -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          >
            <Glyph size={16} units={24} aria-hidden="true">
              <Prims prims={lucideX} />
            </Glyph>
          </button>
        </Tooltip>
      </div>
      <p className="mt-1 text-sm text-(--office-muted)">
        Only your view changes. The file, downloads and prints stay as they are.
      </p>
      <div className="mt-3 flex gap-3">
        <PagePicture {...{ engine, page, width, turns }} look="paper" label="As they are" />
        <PagePicture {...{ engine, page, width, turns }} look="dark" label="Dark pages" />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => onAnswer('Keep')}>
          Keep as they are
        </Button>
        <Button variant="primary" onClick={() => onAnswer('Use')}>
          Use dark pages
        </Button>
      </div>
    </section>
  );
}
