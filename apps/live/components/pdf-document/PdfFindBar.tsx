'use client';

// Find's field on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "Find"): at the top right of the
// pages, the query, the count as a polite live region, Previous and Next, Options (Match case, Whole words, Include
// comments and marks' text, Include bookmarks), All results and Close. Enter and Shift+Enter step; Escape closes.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideList,
  lucideSlidersHorizontal,
  lucideX,
} from '@livedoc/icons/lucide';
import type { IconPrim } from '@livedoc/icons';
import { Glyph, Prims, Tooltip } from '@livedoc/ui';
import type { PdfFindOptions } from '@/lib/pdf-document/pdf-find';
import type { PdfFind } from '@/lib/pdf-document/usePdfFind';

/** Find's options, in the spec's order, with their words. */
export const PDF_FIND_OPTION_NAMES: readonly (readonly [keyof PdfFindOptions, string])[] = [
  ['matchCase', 'Match case'],
  ['wholeWords', 'Whole words'],
  ['marks', 'Include comments and marks’ text'],
  ['bookmarks', 'Include bookmarks'],
];

const BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink) aria-expanded:bg-(--office-pressed) aria-expanded:text-(--office-pressed-ink)';

function BarButton({
  label,
  icon,
  onPress,
  disabled = false,
  pressed,
  expanded,
  controls,
}: {
  label: string;
  icon: readonly IconPrim[];
  onPress: () => void;
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
}): ReactNode {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        aria-controls={controls}
        disabled={disabled}
        onClick={onPress}
        className={BUTTON}
      >
        <Glyph size={18} units={24}>
          <Prims prims={icon} />
        </Glyph>
      </button>
    </Tooltip>
  );
}

export function PdfFindBar({ find, onClosed }: { find: PdfFind; onClosed: () => void }) {
  const field = useRef<HTMLInputElement | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsId = useId();
  const { focusNonce } = find;
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [focusNonce]);
  const results = find.progress?.results.length ?? 0;
  const close = () => {
    find.close();
    onClosed();
  };

  return (
    <div
      role="search"
      aria-label="Find in this PDF"
      className="absolute top-2 right-4 z-20 w-[22rem] max-w-[calc(100%-2rem)] rounded-lg bg-(--office-toolbar) p-1.5 text-sm text-(--office-ink) shadow-md outline outline-1 outline-(--office-line)"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <div className="flex items-center gap-0.5">
        <input
          ref={field}
          type="search"
          aria-label="Find"
          placeholder="Find in this PDF"
          value={find.query}
          onChange={(event) => find.ask(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            find.step(event.shiftKey ? -1 : 1);
          }}
          className="h-8 min-w-0 flex-1 rounded border border-(--office-line) bg-transparent px-2 text-(--office-ink) outline-none placeholder:text-(--office-muted) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
        />
        <span
          role="status"
          aria-live="polite"
          className="min-w-16 shrink-0 px-1 text-right text-xs text-(--office-muted) tabular-nums"
        >
          {find.count}
        </span>
        <BarButton
          label="Previous result"
          icon={lucideChevronUp}
          disabled={results === 0}
          onPress={() => find.step(-1)}
        />
        <BarButton
          label="Next result"
          icon={lucideChevronDown}
          disabled={results === 0}
          onPress={() => find.step(1)}
        />
        <BarButton
          label="Options"
          icon={lucideSlidersHorizontal}
          expanded={showOptions}
          controls={optionsId}
          onPress={() => setShowOptions((shown) => !shown)}
        />
        <BarButton
          label="All results"
          icon={lucideList}
          pressed={find.listOpen}
          onPress={() => find.setListOpen(!find.listOpen)}
        />
        <BarButton label="Close find" icon={lucideX} onPress={close} />
      </div>
      {showOptions ? (
        <fieldset id={optionsId} className="mt-1.5 grid gap-1 px-1 pb-0.5">
          <legend className="sr-only">Options</legend>
          {PDF_FIND_OPTION_NAMES.map(([name, words]) => (
            <label key={name} className="flex h-7 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={find.options[name] ?? false}
                onChange={(event) => find.setOption(name, event.target.checked)}
                className="size-4 accent-(--office-primary)"
              />
              {words}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
