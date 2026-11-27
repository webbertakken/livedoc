'use client';

// The shell's version-history mode (docs/specs/012-collaboration/review-surfaces.md "Version history"): over the whole
// window, Back and the shown version's name or time at the top, the kind's drawing of the version, and the Version
// history panel at the right: Current version first, then the versions newest first, grouped by day, a listbox whose
// arrow keys show each one. Escape or Back leaves it, on the current version. Generic over kinds: the kind supplies
// the versions and the drawing.
import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { lucideArrowLeft } from '@livedoc/icons/lucide';
import { Button, lucideGlyph } from '@livedoc/ui';
import { OfficeIconButton } from '@/components/office/OfficeTitleActions';
import {
  type OfficeVersion,
  versionGroups,
  versionLabel,
  type VersionRow,
} from '@/lib/office/office-version-list';

const BackIcon = lucideGlyph(lucideArrowLeft, 20);

/** The panel's first row: the writing as it is now. */
export const CURRENT_VERSION = 'current';
export const CURRENT_VERSION_LABEL = 'Current version';
/** Said while the versions load, and when they cannot be (default copy). */
export const VERSIONS_LOADING = 'Loading versions…';
export const VERSIONS_FAILED = 'Version history couldn’t be loaded. Try again.';

const optionId = (list: string, id: string) => `${list}-${id}`;

export function OfficeVersionHistory({
  versions,
  failed,
  selected,
  now,
  status,
  onSelect,
  onRetry,
  onClose,
  children,
}: {
  /** The versions, newest first in any order; null while they load. */
  versions: readonly OfficeVersion[] | null;
  /** The versions could not be read. */
  failed: boolean;
  /** The version shown: its id, or CURRENT_VERSION. */
  selected: string;
  now: number;
  /** A refusal or a read under way, said in the panel; null when there is none. */
  status: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onClose: () => void;
  /** The kind's drawing of the shown version. */
  children: ReactNode;
}) {
  const list = useId();
  const listbox = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => versionGroups(versions ?? [], now, false), [versions, now]);
  const order = useMemo(
    () => [CURRENT_VERSION, ...groups.flatMap((g) => g.rows.map((r) => r.id))],
    [groups],
  );
  const shown = versions?.find((v) => v.id === selected);
  const title = shown ? versionLabel(shown, now) : CURRENT_VERSION_LABEL;
  // Opened, the list takes the keyboard (review-surfaces.md "The keys").
  useEffect(() => listbox.current?.focus(), []);
  useEffect(() => {
    document.getElementById(optionId(list, selected))?.scrollIntoView?.({ block: 'nearest' });
  }, [list, selected]);

  const onFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = Math.max(0, order.indexOf(selected));
    const to =
      event.key === 'ArrowDown'
        ? Math.min(order.length - 1, at + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, at - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? order.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    if (order[to] !== selected) onSelect(order[to]!);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onKeyDown={onFrameKeyDown}
      className="office-shell fixed inset-0 z-40 flex flex-col bg-(--office-ground) text-(--office-ink)"
      data-version-history=""
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-(--office-line) px-3">
        <OfficeIconButton label="Back" onClick={onClose}>
          <BackIcon />
        </OfficeIconButton>
        <h1 className="truncate text-name" data-version-title="">
          {title}
        </h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-row phone:flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto" data-region="version">
          {children}
        </div>
        <section
          aria-labelledby={`${list}-title`}
          className="flex w-80 shrink-0 flex-col border-l border-(--office-line) bg-(--office-menu) phone:max-h-[40vh] phone:w-full phone:border-t phone:border-l-0"
        >
          <h2 id={`${list}-title`} className="px-4 pt-4 pb-2 text-body font-medium">
            Version history
          </h2>
          {status ? (
            <p role="status" className="px-4 pb-2 text-(--office-muted)">
              {status}
            </p>
          ) : null}
          {failed ? (
            <div role="alert" className="flex flex-col items-start gap-2 px-4 pb-4">
              <p>{VERSIONS_FAILED}</p>
              <Button size="xs" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : null}
          <div
            ref={listbox}
            role="listbox"
            aria-label="Versions"
            aria-activedescendant={optionId(list, selected)}
            aria-busy={versions === null}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="min-h-0 flex-1 overflow-y-auto pb-4 outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
          >
            <VersionOption
              id={optionId(list, CURRENT_VERSION)}
              selected={selected === CURRENT_VERSION}
              onSelect={() => onSelect(CURRENT_VERSION)}
            >
              <span className="font-medium">{CURRENT_VERSION_LABEL}</span>
            </VersionOption>
            {versions === null && !failed ? (
              <p className="px-4 py-2 text-(--office-muted)">{VERSIONS_LOADING}</p>
            ) : null}
            {groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                <p
                  aria-hidden="true"
                  className="px-4 pt-3 pb-1 text-supporting text-(--office-muted)"
                >
                  {group.label}
                </p>
                {group.rows.map((row) => (
                  <VersionOption
                    key={row.id}
                    id={optionId(list, row.id)}
                    selected={selected === row.id}
                    onSelect={() => onSelect(row.id)}
                  >
                    <VersionRowText row={row} />
                  </VersionOption>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function VersionOption({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-0.5 px-4 py-2 text-body hover:bg-(--office-hover) ${
        selected ? 'bg-(--office-pressed) text-(--office-pressed-ink)' : ''
      }`}
    >
      {children}
    </div>
  );
}

function VersionRowText({ row }: { row: VersionRow }) {
  return (
    <>
      <span className={row.named ? 'font-medium' : ''}>{row.title}</span>
      {row.time ? <span className="text-(--office-muted)">{row.time}</span> : null}
      {row.restoredFrom ? (
        <span className="text-(--office-muted) italic">{row.restoredFrom}</span>
      ) : null}
      {row.editors.length > 0 ? (
        <ul aria-label="Editors" className="flex flex-col gap-0.5">
          {row.editors.map((editor) => (
            <li key={editor.name} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-(--editor-colour)"
                style={{ '--editor-colour': editor.colour } as React.CSSProperties}
              />
              <span>{editor.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
