'use client';

// The shell's version-history mode (docs/specs/012-collaboration/review-surfaces.md "Version history"): over the whole
// window, Back and the shown version's name or time at the top, the kind's drawing of the version, and the Version
// history panel at the right: Current version first, then the versions newest first, grouped by day, a listbox whose
// arrow keys show each one, Only show named versions over it and Show changes under it. Each row's ⋮ names, renames or
// restores it, where the kind may (OfficeVersionRowMenu); a name is typed in place (OfficeVersionNameField). Escape or
// Back leaves it, on the current version. Generic over kinds: the kind supplies the versions, the drawing and the
// writes.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { lucideArrowLeft } from '@livedoc/icons/lucide';
import { Button, lucideGlyph, SwitchRow } from '@livedoc/ui';
import { OfficeIconButton } from '@/components/office/OfficeTitleActions';
import {
  type OfficeVersion,
  versionGroups,
  versionLabel,
  versionMenuItems,
  type VersionMenuItem,
  type VersionRow,
  versionTime,
} from '@/lib/office/office-version-list';
import { OfficeVersionMoreButton, OfficeVersionRowMenu } from './OfficeVersionRowMenu';
import { OfficeVersionNameField } from './OfficeVersionNameField';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { createShortcutMatcher, type ShortcutKeys } from '@/lib/office/shortcut-matcher';

const BackIcon = lucideGlyph(lucideArrowLeft, 20);

/** The panel's first row: the writing as it is now. */
export const CURRENT_VERSION = 'current';
export const CURRENT_VERSION_LABEL = 'Current version';
/** Said while the versions load, and when they cannot be (default copy). */
export const VERSIONS_LOADING = 'Loading versions…';
export const VERSIONS_FAILED = 'Version history couldn’t be loaded. Try again.';

const optionId = (list: string, id: string) => `${list}-${id}`;

/** What the kind lets the person do to a version from its menu; none where they may not. */
export type OfficeVersionWrites = {
  /** Names (or, with an empty name, unnames) a version; CURRENT_VERSION names the current one. */
  readonly name: (id: string, name: string) => void;
  readonly restore: (id: string) => void;
  readonly copy: (id: string) => void;
  /** The longest name, in characters. */
  readonly nameMax: number;
};

/** The keys between what the shown version changed (⌘⌥ N then R, ⌘⌥ P then R), and going there. */
export type OfficeVersionChanges = {
  readonly next: ShortcutKeys;
  readonly previous: ShortcutKeys;
  readonly onStep: (forward: boolean) => void;
};

/** The Show changes check box: what the shown version changed, drawn or not. */
export type OfficeShowChanges = {
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
};

export function OfficeVersionHistory({
  versions,
  failed,
  selected,
  now,
  status,
  onSelect,
  onRetry,
  onClose,
  showChanges = null,
  writes = null,
  changes = null,
  said = '',
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
  showChanges?: OfficeShowChanges | null;
  writes?: OfficeVersionWrites | null;
  changes?: OfficeVersionChanges | null;
  /** Said to a screen reader as it happens (a change gone to). */
  said?: string;
  /** The kind's drawing of the shown version. */
  children: ReactNode;
}) {
  const list = useId();
  const listbox = useRef<HTMLDivElement | null>(null);
  // The list as an element, where a row's menu gives focus back when it closes.
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const attachList = useCallback((element: HTMLDivElement | null) => {
    listbox.current = element;
    setListElement(element);
  }, []);
  const [namedOnly, setNamedOnly] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const groups = useMemo(
    () => versionGroups(versions ?? [], now, namedOnly),
    [versions, now, namedOnly],
  );
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

  // The keys between changes, read with the person's keyboard (office-shell.md "Shortcut layer").
  const matcher = useMemo(
    () =>
      changes
        ? createShortcutMatcher(
            [
              { id: 'next', keys: changes.next },
              { id: 'previous', keys: changes.previous },
            ],
            currentOfficePlatform(),
          )
        : null,
    [changes],
  );
  const onFrameKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const match = matcher?.keyup(event.nativeEvent);
    if (match) changes?.onStep(match.id === 'next');
  };
  const onFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const match =
      event.target instanceof HTMLInputElement ? null : matcher?.keydown(event.nativeEvent);
    if (match) {
      event.preventDefault();
      if (match !== 'pending') changes?.onStep(match.id === 'next');
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const titleOf = (id: string) => {
    const version = versions?.find((v) => v.id === id);
    return version ? versionLabel(version, now) : CURRENT_VERSION_LABEL;
  };
  const itemsOf = (id: string): VersionMenuItem[] => {
    if (id === CURRENT_VERSION) return versionMenuItems('current');
    return versionMenuItems({ named: versions?.find((v) => v.id === id)?.kind === 'named' });
  };
  const choose = (id: string, item: VersionMenuItem) => {
    if (!writes) return;
    if (item === 'name' || item === 'rename') setNaming(id);
    else if (item === 'remove-name') writes.name(id, '');
    else if (item === 'restore') writes.restore(id);
    else writes.copy(id);
  };
  const openMenu = (id: string, anchor: DOMRect) => {
    if (id !== selected) onSelect(id);
    setMenu({ id, anchor });
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Shift+F10 or the menu key opens the selected row's menu (review-surfaces.md "The keys").
    if (writes && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
      event.preventDefault();
      const row = document.getElementById(optionId(list, selected));
      if (row) setMenu({ id: selected, anchor: row.getBoundingClientRect() });
      return;
    }
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
      onKeyUp={onFrameKeyUp}
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
          {/* A refusal or a read under way, shown; else what the keys went to, for a screen reader alone. */}
          <p role="status" className={status ? 'px-4 pb-2 text-(--office-muted)' : 'sr-only'}>
            {status ?? said}
          </p>
          {failed ? (
            <div role="alert" className="flex flex-col items-start gap-2 px-4 pb-4">
              <p>{VERSIONS_FAILED}</p>
              <Button size="xs" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : null}
          <SwitchRow checked={namedOnly} onChange={setNamedOnly} className="px-4 pb-2">
            Only show named versions
          </SwitchRow>
          <div
            ref={attachList}
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
              more={writes ? (anchor) => openMenu(CURRENT_VERSION, anchor) : null}
            >
              {writes && naming === CURRENT_VERSION ? (
                <OfficeVersionNameField
                  initial=""
                  placeholder={versionTime(now)}
                  maxLength={writes.nameMax}
                  onKeep={(name) => {
                    setNaming(null);
                    if (name) writes.name(CURRENT_VERSION, name);
                    listbox.current?.focus();
                  }}
                  onLeave={() => {
                    setNaming(null);
                    listbox.current?.focus();
                  }}
                />
              ) : (
                <span className="font-medium">{CURRENT_VERSION_LABEL}</span>
              )}
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
                    more={writes ? (anchor) => openMenu(row.id, anchor) : null}
                  >
                    {writes && naming === row.id ? (
                      <OfficeVersionNameField
                        initial={row.named ? row.title : ''}
                        placeholder={row.time ?? row.title}
                        maxLength={writes.nameMax}
                        onKeep={(name) => {
                          setNaming(null);
                          if (name !== (row.named ? row.title : '')) writes.name(row.id, name);
                          listbox.current?.focus();
                        }}
                        onLeave={() => {
                          setNaming(null);
                          listbox.current?.focus();
                        }}
                      />
                    ) : (
                      <VersionRowText row={row} />
                    )}
                  </VersionOption>
                ))}
              </div>
            ))}
          </div>
          {showChanges ? (
            <label className="flex items-center gap-2 border-t border-(--office-line) px-4 py-3">
              <input
                type="checkbox"
                checked={showChanges.checked}
                onChange={(event) => showChanges.onChange(event.target.checked)}
                className="size-icon-row accent-(--office-focus)"
              />
              Show changes
            </label>
          ) : null}
        </section>
        {menu && writes ? (
          <OfficeVersionRowMenu
            title={titleOf(menu.id)}
            items={itemsOf(menu.id)}
            anchor={menu.anchor}
            returnTo={listElement}
            onClose={() => setMenu(null)}
            onChoose={(item) => choose(menu.id, item)}
          />
        ) : null}
      </div>
    </div>
  );
}

function VersionOption({
  id,
  selected,
  onSelect,
  more,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  /** Opens the row's menu from its ⋮; none where the kind offers none. */
  more: ((anchor: DOMRect) => void) | null;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`group flex cursor-pointer items-start gap-2 px-4 py-2 text-body hover:bg-(--office-hover) ${
        selected ? 'bg-(--office-pressed) text-(--office-pressed-ink)' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      {more ? (
        <div className={selected ? '' : 'invisible group-hover:visible'}>
          <OfficeVersionMoreButton onOpen={more} />
        </div>
      ) : null}
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
