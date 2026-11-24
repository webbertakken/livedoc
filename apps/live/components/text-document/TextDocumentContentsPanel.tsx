'use client';

// The Table of contents side panel's body (docs/specs/034-text-documents/links-and-navigation.md "Table of contents"):
// the selected table of contents' look, three choices each with its picture, and the heading levels it lists, 1 to 6.
// A choice rebuilds it at once; with none selected the panel says how to choose one.
import { useId } from 'react';
import { CONTENTS_LEVELS_MAX, type ContentsLook } from '@livedoc/text-documents';
import {
  CONTENTS_LOOK_LABELS,
  type ContentsChange,
} from '@/lib/text-document/text-document-contents-build';
import { ContentsLookPicture } from './ContentsLookPicture';

const CHOICE = 'size-4 shrink-0 accent-(--office-primary)';
const HEADING = 'mb-2 text-sm font-medium';
const ROW = 'flex cursor-pointer items-center gap-3 text-sm';
const SELECT =
  'h-9 w-full cursor-pointer rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) [&>option]:bg-(--office-menu)';

const LOOKS: readonly ContentsLook[] = ['plain', 'dotted', 'links'];
const LEVELS = Array.from({ length: CONTENTS_LEVELS_MAX }, (_, i) => i + 1);

export function TextDocumentContentsPanel({
  selected,
  onChange,
}: {
  // The selected table of contents' look and levels, or null when none is selected.
  selected: { look: ContentsLook; levels: number } | null;
  onChange: (change: ContentsChange) => void;
}) {
  const ids = { look: useId(), levels: useId() };
  if (!selected)
    return (
      <p className="px-2 pt-1 text-sm text-(--office-muted)">
        Select a table of contents to change its options.
      </p>
    );
  return (
    <div className="flex flex-col gap-6 px-2 pt-1">
      <div role="radiogroup" aria-labelledby={ids.look} className="flex flex-col gap-3">
        <span id={ids.look} className={HEADING}>
          Look
        </span>
        {LOOKS.map((look) => (
          <label key={look} className={ROW}>
            <input
              type="radio"
              name={ids.look}
              className={CHOICE}
              checked={selected.look === look}
              onChange={() => onChange({ look })}
            />
            <span className="flex text-(--office-icon)">
              <ContentsLookPicture look={look} />
            </span>
            {CONTENTS_LOOK_LABELS[look]}
          </label>
        ))}
      </div>
      <div className="flex flex-col">
        <label htmlFor={ids.levels} className={HEADING}>
          Levels
        </label>
        <select
          id={ids.levels}
          value={selected.levels}
          onChange={(e) => onChange({ levels: Number(e.target.value) })}
          className={SELECT}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
