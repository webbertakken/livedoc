'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { groupTabsIntoRuns, tabFolderName, type Tab } from '@livedoc/document';
import { MENU_PANEL, MenuTreeContext, isInMenuSurface, useControlMenu } from '@livedoc/ui';
import { FolderMenuIcon, SearchGlyph } from '@/components/chrome/tab-bar-icons';
import { NameEditor } from '@/components/primitives/NameEditor';
import {
  TAB_LIST_EDGE_PX,
  TAB_LIST_FILTER_FROM,
  TAB_LIST_GAP_PX,
  TAB_LIST_WIDTH_PX,
} from './line-constants';
import { TabListRow } from './TabListRow';
import { track } from '@/lib/telemetry';
import type { TabsChrome, TabsChromeProps } from './tabs-chrome';
import { peopleHereLabel } from './TabListButtons';
import { addTabMark, addTabRows, NO_ADD_TAB_OFFERS } from './AddTabMenu';
import { newTabMode } from '@/lib/new-tab-seed';

// Where the list hangs: above its opener, its arrow at the opener's centre, kept inside the window's edge.
function placeAbove(opener: HTMLElement | null) {
  if (!opener) return { left: TAB_LIST_EDGE_PX, bottom: TAB_LIST_EDGE_PX, arrow: 24 };
  const r = opener.getBoundingClientRect();
  const centre = r.left + r.width / 2;
  const max = window.innerWidth - TAB_LIST_EDGE_PX - TAB_LIST_WIDTH_PX;
  const left = Math.max(TAB_LIST_EDGE_PX, Math.min(centre - TAB_LIST_WIDTH_PX / 2, max));
  return { left, bottom: window.innerHeight - r.top + TAB_LIST_GAP_PX, arrow: centre - left };
}

// The tab list's keyboard stops, in order: the filter, every row's switch, New Tab.
const STOPS =
  '[data-tab-list-filter], [data-tab-list-item]:not([aria-disabled]), [data-tab-list-new]';

// The tab list (docs/specs/007-editor/toolbar-layout.md "The tab list"): the one place every tab is seen and switched
// to. A control menu (it holds a filter and rename fields beside its rows) hanging above the button that opened it.
export function TabList({
  tabs,
  chrome,
  opener,
  peopleHere,
  onClose,
}: {
  tabs: TabsChromeProps;
  chrome: TabsChrome;
  opener: HTMLElement | null;
  peopleHere: number;
  onClose: () => void;
}) {
  const readOnly = tabs.readOnly ?? false;
  const menu = useControlMenu({ onClose, trigger: opener, label: 'Tabs', focusOnOpen: false });
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(() => placeAbove(opener));
  const listRef = useRef<HTMLDivElement | null>(null);
  const filterShown = tabs.tabs.length >= TAB_LIST_FILTER_FROM;

  // Re-measured as the window resizes, so the list stays on its opener.
  useLayoutEffect(() => {
    const update = () => setPlace(placeAbove(opener));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [opener]);

  // Opening lands on the filter, else on the active row.
  useLayoutEffect(() => {
    const root = listRef.current;
    const target =
      root?.querySelector<HTMLElement>('[data-tab-list-filter]') ??
      root?.querySelector<HTMLElement>('[data-tab-list-item][aria-current="page"]') ??
      root?.querySelector<HTMLElement>(STOPS);
    target?.focus({ preventScroll: true });
  }, []);

  // A press outside closes it: not on its opener (whose toggle does) nor in a menu it opened (the tab menu).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || listRef.current?.contains(target) || opener?.contains(target)) return;
      if (isInMenuSurface(e.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [opener, onClose]);

  const pick = (tabId: string) => {
    if (!tabs.tabs.some((t) => t.id === tabId)) {
      console.warn('[tab-list] row for a missing tab', { tabId });
      onClose();
      return;
    }
    track('Tab', 'Selected', 'TabList');
    tabs.onSelect(tabId);
    onClose();
  };

  // A row dropped on another: into or out of the target's folder as needed, then next to it.
  const dropOnRow = (sourceId: string, target: Tab, before: boolean) => {
    const source = tabs.tabs.find((t) => t.id === sourceId);
    if (!source) return;
    const from = tabFolderName(source);
    const to = tabFolderName(target);
    if (to && to !== from) tabs.onMoveTabToFolder(sourceId, to);
    else if (!to && from) tabs.onRemoveTabFromFolder(sourceId);
    tabs.onReorder(sourceId, target.id, before);
  };
  const dropOnFolder = (e: ReactDragEvent, folder: string) => {
    e.preventDefault();
    const source = e.dataTransfer.getData('text/plain');
    if (source) tabs.onMoveTabToFolder(source, folder);
  };

  const needle = query.trim().toLowerCase();
  const matches = (tab: Tab) => !needle || tab.name.toLowerCase().includes(needle);
  const runs = groupTabsIntoRuns(tabs.tabs)
    .map((run) =>
      run.kind === 'loose'
        ? matches(run.tab)
          ? run
          : null
        : { ...run, shown: run.tabs.filter(matches) },
    )
    .filter((run) => run !== null && (run.kind === 'loose' || run.shown.length > 0));

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    };
    const move = keys[e.key];
    if (move === undefined || !listRef.current) return;
    const stops = [...listRef.current.querySelectorAll<HTMLElement>(STOPS)];
    if (stops.length === 0) return;
    e.preventDefault();
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next =
      move === 'first'
        ? 0
        : move === 'last'
          ? stops.length - 1
          : (at + move + stops.length) % stops.length;
    stops[next]?.focus();
  };

  return createPortal(
    <MenuTreeContext.Provider value={menu.tree}>
      <div
        ref={(el) => {
          listRef.current = el;
          menu.attach(el);
        }}
        {...menu.surfaceProps}
        data-tab-list=""
        data-floating-panel=""
        onKeyDown={onKeyDown}
        style={{ left: place.left, bottom: place.bottom, width: TAB_LIST_WIDTH_PX }}
        className={`fixed z-[var(--z-popover)] max-h-[min(32rem,calc(100dvh-8rem))] rounded-surface p-2 outline-none ${MENU_PANEL}`}
      >
        <div className="flex items-center justify-between px-2 pb-2 pt-1.5 text-supporting text-slate-500 dark:text-slate-400">
          <span>Tabs · {tabs.tabs.length}</span>
          {peopleHere > 0 ? (
            <span className="normal-case tracking-normal">{peopleHereLabel(peopleHere)}</span>
          ) : null}
        </div>
        {filterShown ? (
          <label className="mx-0.5 mb-1.5 flex h-field items-center gap-2 rounded-control border border-slate-200 px-2 text-slate-500 focus-within:border-brand-400 dark:border-slate-700 dark:text-slate-400">
            <SearchGlyph />
            <input
              data-tab-list-filter=""
              type="search"
              role="searchbox"
              aria-label="Find a tab"
              placeholder="Find a tab"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Escape clears a query first, then closes.
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery('');
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-supporting text-slate-800 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </label>
        ) : null}
        <ul
          role="list"
          className="scrollbar-slim -mx-0.5 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-0.5"
        >
          {runs.map((run) =>
            run!.kind === 'loose' ? (
              <TabListRow
                key={run!.tab.id}
                tab={run!.tab}
                tabs={tabs}
                chrome={chrome}
                indented={false}
                onPick={pick}
                onDropOnRow={dropOnRow}
              />
            ) : (
              <FolderRows
                key={`folder:${run!.name}`}
                name={run!.name}
                count={run!.tabs.length}
                shown={run!.shown}
                readOnly={readOnly}
                onDrop={(e) => dropOnFolder(e, run!.name)}
                onRename={(next) => tabs.onRenameFolder(run!.name, next)}
                renderRow={(tab) => (
                  <TabListRow
                    key={tab.id}
                    tab={tab}
                    tabs={tabs}
                    chrome={chrome}
                    indented
                    onPick={pick}
                    onDropOnRow={dropOnRow}
                  />
                )}
              />
            ),
          )}
          {runs.length === 0 ? (
            <li className="px-2 py-2 text-supporting text-slate-500 dark:text-slate-400">
              No tab matches
            </li>
          ) : null}
        </ul>
        {readOnly ? null : (
          // The add menu's rows (docs/specs/007-editor/toolbar-layout.md "The tab list"): New Tab, New Board, New
          // Sheet, New Dashboard and, where offered, New Text Document and New PDF From a File, each adding its choice
          // and closing the list.
          <div className="mt-1.5 flex flex-col gap-0.5 border-t border-slate-200 pt-1.5 dark:border-slate-800">
            {addTabRows(tabs.addTabOffers ?? NO_ADD_TAB_OFFERS).map(({ choice, footer }) => {
              const Mark = addTabMark(choice, newTabMode(chrome.activeTab));
              return (
                <button
                  key={choice}
                  type="button"
                  data-tab-list-new={choice}
                  onClick={() => {
                    tabs.onAdd(choice);
                    onClose();
                  }}
                  className="flex h-row w-full items-center gap-2 rounded-control px-2 text-body text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Mark
                    size={14}
                    aria-hidden
                    className="shrink-0 text-slate-500 dark:text-slate-400"
                  />
                  {footer}
                </button>
              );
            })}
          </div>
        )}
        <span
          aria-hidden
          style={{ left: place.arrow - 5 }}
          className="absolute -bottom-[6px] h-2.5 w-2.5 rotate-45 border-b border-r border-slate-200/80 bg-white dark:border-slate-700/80 dark:bg-slate-900"
        />
      </div>
    </MenuTreeContext.Provider>,
    document.body,
  );
}

// A folder's heading (glyph, name, count) and its tabs under it. A tab dragged onto the heading joins the folder.
function FolderRows({
  name,
  count,
  shown,
  readOnly,
  onDrop,
  onRename,
  renderRow,
}: {
  name: string;
  count: number;
  shown: Tab[];
  readOnly: boolean;
  onDrop: (e: ReactDragEvent) => void;
  onRename: (next: string) => void;
  renderRow: (tab: Tab) => React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <li
        data-tab-folder={name}
        onDragOver={
          readOnly
            ? undefined
            : (e) => {
                e.preventDefault();
                setOver(true);
              }
        }
        onDragLeave={() => setOver(false)}
        onDrop={
          readOnly
            ? undefined
            : (e) => {
                setOver(false);
                onDrop(e);
              }
        }
        className={`flex h-row items-center gap-2 rounded-control px-2 text-supporting text-slate-500 dark:text-slate-400 ${
          over ? 'bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-500/15' : ''
        }`}
      >
        <FolderMenuIcon />
        {renaming ? (
          <NameEditor
            initial={name}
            onCommit={(next) => {
              const trimmed = next.trim();
              if (trimmed && trimmed !== name) onRename(trimmed);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
            className="h-chip min-w-0 flex-1 rounded-control bg-white px-2 text-supporting text-slate-800 outline-none ring-1 ring-brand-300 dark:bg-slate-800 dark:text-slate-100"
          />
        ) : (
          <span className="truncate" onDoubleClick={readOnly ? undefined : () => setRenaming(true)}>
            {name}
          </span>
        )}
        <span aria-hidden className="font-normal">
          {count}
        </span>
      </li>
      {shown.map(renderRow)}
    </>
  );
}
