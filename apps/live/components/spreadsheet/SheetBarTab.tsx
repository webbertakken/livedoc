'use client';

// One sheet tab of the sheet bar (docs/specs/029-sheets/surface.md "Sheet bar"): the sheet's name on its colour's
// underline, who else is on it, and its menu arrow (on the open tab and the tab under the pointer, D175). A double-click, Rename or Alt+1 turns
// the name into a field: Enter or leaving it saves, Escape keeps the name (D172).
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { lucideClipboardList } from '@livedoc/icons/lucide';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import type { SheetBarPeer, SheetBarTab as Tab } from './SheetBar';

// Faces a tab shows before the rest are counted ("+2").
export const SHEET_BAR_FACES_MAX = 3;

function Faces({ peers }: { peers: readonly SheetBarPeer[] }) {
  if (!peers.length) return null;
  const shown = peers.slice(0, SHEET_BAR_FACES_MAX);
  const more = peers.length - shown.length;
  return (
    <span aria-hidden="true" className="ml-2 inline-flex items-center -space-x-1">
      {shown.map((p) => (
        <span
          key={p.id}
          data-sheet-peer={p.id}
          className="inline-block size-2.5 rounded-full ring-2 ring-white dark:ring-slate-900"
          style={{ backgroundColor: p.color }}
        />
      ))}
      {more > 0 ? (
        <span className="pl-2 text-supporting text-slate-600 dark:text-slate-300">+{more}</span>
      ) : null}
    </span>
  );
}

// A sheet a form writes to (docs/specs/029-sheets/plan-links.md "Form responses"), as Google marks one.
const FormIcon = lucideGlyph(lucideClipboardList, 14);
export const FORM_MARK_LABEL = 'Takes responses from a form';

// What a screen reader hears for a tab: its name, that a form writes to it, and who is on it.
export function sheetTabLabel(name: string, peers: readonly SheetBarPeer[], form = false): string {
  const named = form ? `${name}, ${FORM_MARK_LABEL.toLowerCase()}` : name;
  return peers.length ? `${named}, also here: ${peers.map((p) => p.name).join(', ')}` : named;
}

function RenameField({
  name,
  onDone,
}: {
  name: string;
  // The name typed, or null to keep the old one.
  onDone: (typed: string | null) => void;
}) {
  const field = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  // Focused once the menu that asked for it has closed and handed focus back.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const finish = (typed: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(typed);
  };
  return (
    <input
      ref={field}
      aria-label="Sheet name"
      defaultValue={name}
      maxLength={100}
      data-sheet-rename=""
      className="my-auto h-field w-32 rounded-control border border-emerald-600 bg-white px-2 text-body text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

export function SheetBarTab({
  tab,
  active,
  peers,
  renaming,
  canRename,
  onSelect,
  onKey,
  onMenu,
  onRename,
  onRenamed,
  onPointerDown,
  dragged = false,
  colour,
  form = false,
}: {
  tab: Tab;
  active: boolean;
  peers: readonly SheetBarPeer[];
  renaming: boolean;
  canRename: boolean;
  onSelect: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  // Open the tab's menu at a point; `fromBar` when opened from the tab itself (it then opens upwards).
  onMenu: (x: number, y: number, fromBar: boolean) => void;
  onRename: () => void;
  onRenamed: (typed: string | null) => void;
  // A press that may become a drag (D176), and whether this tab is being dragged.
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  dragged?: boolean;
  // The tab's colour, drawn as its underline (D177).
  colour?: string;
  // A form writes its responses to the tab's sheet: a form mark before its name.
  form?: boolean;
}) {
  // Who is here and the form mark, named on hover as the tab is named to a screen reader.
  const label = peers.length || form ? sheetTabLabel(tab.name, peers, form) : '';
  const fromTab = (el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    onMenu(box.left, box.top, true);
  };
  return (
    <div
      data-sheet-tab-face={tab.id}
      onPointerDown={onPointerDown}
      data-sheet-tab-colour={colour}
      className={`group relative flex max-w-56 items-stretch ${dragged ? 'opacity-60 ' : ''}${
        active
          ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-800 dark:text-emerald-300'
          : 'text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY, false);
      }}
    >
      {colour ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1 bottom-0 h-[3px] rounded-t-control"
          style={{ backgroundColor: colour }}
        />
      ) : null}
      {renaming ? (
        <span className="flex items-center px-2">
          <RenameField name={tab.name} onDone={onRenamed} />
        </span>
      ) : (
        <Tooltip label={label}>
          <button
            type="button"
            role="tab"
            data-sheet-tab={tab.id}
            aria-selected={active}
            aria-label={label || undefined}
            aria-haspopup="menu"
            tabIndex={active ? 0 : -1}
            onClick={onSelect}
            onDoubleClick={() => {
              if (canRename) onRename();
            }}
            onKeyDown={(e) => {
              if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
                e.preventDefault();
                fromTab(e.currentTarget);
                return;
              }
              onKey(e);
            }}
            className={`flex min-w-0 items-center py-0 pl-4 text-body focus-visible:outline-2 ${
              active ? 'pr-1 font-medium' : 'pr-1'
            }`}
          >
            {form ? (
              <FormIcon
                aria-hidden
                data-sheet-tab-form=""
                className="mr-1.5 shrink-0 text-violet-700 dark:text-violet-300"
              />
            ) : null}
            <span className="truncate">{tab.name}</span>
            <Faces peers={peers} />
          </button>
        </Tooltip>
      )}
      {renaming ? null : (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${tab.name} menu`}
          aria-haspopup="menu"
          data-sheet-tab-menu={tab.id}
          onClick={(e) => fromTab(e.currentTarget)}
          className={`mr-1 flex w-chip items-center justify-center rounded-control text-glyph text-slate-500 hover:bg-slate-300 dark:text-slate-400 dark:hover:bg-slate-700 ${
            active ? '' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          ▾
        </button>
      )}
    </div>
  );
}
