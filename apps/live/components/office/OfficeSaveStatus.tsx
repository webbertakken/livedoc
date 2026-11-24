'use client';

// The save status in the office title row (docs/specs/034-text-documents/editing-surface.md "The title row"): its
// glyph, its words while something is not yet safe, and a press for what it means. Offline and Failed are announced
// as they begin; the rest change too often to be worth a word.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { HoverCard, useClickOutside, useEscape } from '@livedoc/ui';
import { afterNextPaint } from '@/lib/after-next-paint';
import { OfficeSaveIcons } from './office-icons';
import {
  isUnsettled,
  OFFICE_SAVE_STATUS,
  type OfficeSaveStatus,
  type OfficeSaveStatusSource,
} from './office-save-status';

const ANNOUNCED: readonly OfficeSaveStatus[] = ['offline', 'failed'];

export function OfficeSaveStatusButton({ status }: { status: OfficeSaveStatus }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, () => setOpen(false), open);
  useEscape(() => setOpen(false), { enabled: open });
  const { words, meaning } = OFFICE_SAVE_STATUS[status];
  const Icon = OfficeSaveIcons[status];
  const failed = status === 'failed';
  const tone = failed ? 'text-(--office-error)' : 'text-(--office-muted)';
  return (
    <div ref={box} className="relative flex min-w-0 shrink items-center">
      <HoverCard title={words}>
        <button
          type="button"
          aria-label={words}
          aria-expanded={open}
          data-save-status={status}
          onClick={() => setOpen((was) => !was)}
          className={`relative flex h-field min-w-8 items-center gap-2 rounded-full px-2 outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) ${tone}`}
        >
          <Icon />
          {isUnsettled(status) ? (
            <span data-save-words="" className="truncate text-body phone:hidden">
              {words}
            </span>
          ) : null}
        </button>
      </HoverCard>
      <span role="status" className="sr-only">
        {ANNOUNCED.includes(status) ? words : ''}
      </span>
      {open ? (
        <div className="absolute top-full left-0 z-30 mt-1 w-72 rounded-control bg-(--office-menu) px-4 py-3 text-body text-(--office-ink) shadow-lg">
          <p className={`font-medium ${failed ? 'text-(--office-error)' : ''}`}>{words}</p>
          <p className="mt-1 text-(--office-muted)">{meaning}</p>
        </div>
      ) : null}
    </div>
  );
}

const NONE = () => null;

/**
 * The kind's save status, watched here so that a change draws the status alone (none: nothing), after the frame it
 * happens in: a keystroke's Saving never holds up the keystroke's paint (editing-surface.md "The title row").
 */
export function OfficeSaveStatusShown({ source }: { source: OfficeSaveStatusSource }) {
  const subscribe = useCallback(
    (listener: () => void) => {
      let waiting: (() => void) | null = null;
      const stop = source.subscribe(() => {
        waiting ??= afterNextPaint(() => {
          waiting = null;
          listener();
        });
      });
      return () => {
        stop();
        waiting?.();
      };
    },
    [source],
  );
  const status = useSyncExternalStore(subscribe, source.get, NONE);
  return status ? <OfficeSaveStatusButton status={status} /> : null;
}
