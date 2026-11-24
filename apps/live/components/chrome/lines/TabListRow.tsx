'use client';

import { useId, type DragEvent as ReactDragEvent } from 'react';
import { tabKindName, type Tab } from '@livedoc/document';
import { SideBySideIcon } from '@livedoc/ui';
import { NameEditor } from '@/components/primitives/NameEditor';
import { EllipsisMenuButton } from '@/components/chrome/EllipsisMenuButton';
import { TabPresenceStack } from '@/components/chrome/TabPresenceStack';
import { TabLockIcon, TabNotSharedIcon } from '@/components/chrome/tab-bar-icons';
import { TabKindGlyph } from '@/components/chrome/editor-mode/TabKindGlyph';
import { useSplitViewContext } from '@/components/split/SplitViewContext';
import { legibleTabAccent } from '@/lib/tab-accent';
import type { TabsChrome, TabsChromeProps } from './tabs-chrome';

// A row's look: the row step, the hover fill; the active one tinted with the tab's accent and its inset ring, the
// same segment the document group draws for it (never a bordered box).
const ROW =
  'relative flex h-row items-center gap-2 rounded-control px-2 text-body text-slate-700 dark:text-slate-300';
const ROW_BUTTON =
  'flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

export function activeTabTint(tab: Tab, isDark: boolean) {
  const accent = legibleTabAccent(tab, isDark);
  return {
    color: accent,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 45%, transparent)`,
  };
}

// One tab in the tab list (docs/specs/007-editor/toolbar-layout.md "The tab list"): its kind glyph (its hover card and
// the row's description naming the kind: editor-modes.md "A tab's kind is always findable"), its name (cut short with an
// ellipsis), the presence stack of who is on it, and on the active row its tab menu. It switches on a
// press, renames on a double-click or F2, drags to reorder, and opens the tab menu on a right-click, for someone who
// may change the tabs. `indented`: a folder's tab, under its heading.
export function TabListRow({
  tab,
  tabs,
  chrome,
  indented,
  onPick,
  onDropOnRow,
}: {
  tab: Tab;
  tabs: TabsChromeProps;
  chrome: TabsChrome;
  indented: boolean;
  onPick: (tabId: string) => void;
  onDropOnRow: (sourceId: string, target: Tab, before: boolean) => void;
}) {
  const split = useSplitViewContext();
  const kindId = useId();
  const readOnly = tabs.readOnly ?? false;
  const participants = tabs.participantsByTab.get(tab.id) ?? [];
  const inset = indented ? 'pl-6' : '';
  if (tabs.isOutOfScope?.(tab.id)) {
    // Outside a tab-scoped session's scope (docs/specs/013-workspace/tab-scoped-share-links.md): no name (the server
    // never sent one), no switch, no menu, no drag; peers on it still show.
    return (
      <li data-tab-row={tab.id} className={`${ROW} ${inset} text-slate-500 dark:text-slate-400`}>
        <button type="button" aria-disabled="true" className={`${ROW_BUTTON} cursor-not-allowed`}>
          <TabNotSharedIcon />
          <span className="truncate">Not shared</span>
        </button>
        <TabPresenceStack
          participants={participants}
          selfId={tabs.selfId}
          selfRole={tabs.selfRole}
        />
      </li>
    );
  }
  const isActive = tab.id === tabs.activeId;
  const isEditing = chrome.editingId === tab.id && !readOnly;
  const beside =
    !!split?.pair &&
    tab.id !== split.activeId &&
    (split.pair.leftId === tab.id || split.pair.rightId === tab.id);
  const caret = chrome.reorderDrag.caretFor(tab.id);
  const drag = chrome.reorderDrag.handlersFor(tab.id);
  return (
    <li
      data-tab-row={tab.id}
      draggable={!isEditing && !readOnly}
      {...(readOnly
        ? {}
        : {
            ...drag,
            onDrop: (e: ReactDragEvent) => {
              e.preventDefault();
              const source = e.dataTransfer.getData('text/plain');
              if (source && source !== tab.id) onDropOnRow(source, tab, caret !== 'after');
              drag.onDragEnd();
            },
          })}
      onContextMenu={
        readOnly
          ? undefined
          : (e) => {
              // Right-click anywhere on the row opens its tab menu, switching to the tab first so the menu's
              // active-tab actions target what was pointed at.
              e.preventDefault();
              if (!isActive) tabs.onSelect(tab.id);
              chrome.setMenuFor(tab.id);
            }
      }
      style={isActive && !isEditing ? activeTabTint(tab, chrome.isDark) : undefined}
      className={`${ROW} ${inset} ${
        isActive
          ? 'bg-slate-100 pr-1 dark:bg-slate-800'
          : 'hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      {caret ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-brand-500 ${
            caret === 'before' ? '-top-px' : '-bottom-px'
          }`}
        />
      ) : null}
      {isEditing ? (
        <NameEditor
          initial={tab.name}
          onCommit={(name) => {
            tabs.onRename(tab.id, name.trim() || tab.name);
            chrome.setEditingId(null);
          }}
          onCancel={() => chrome.setEditingId(null)}
          className="h-row min-w-0 flex-1 rounded-control bg-white px-2 text-body text-slate-800 outline-none ring-1 ring-brand-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-brand-400"
        />
      ) : (
        <button
          type="button"
          data-tab-list-item=""
          aria-current={isActive ? 'page' : undefined}
          aria-describedby={kindId}
          onClick={() => onPick(tab.id)}
          onDoubleClick={readOnly ? undefined : () => chrome.setEditingId(tab.id)}
          onKeyDown={(e) => {
            if (e.key !== 'F2' || readOnly) return;
            e.preventDefault();
            chrome.setEditingId(tab.id);
          }}
          className={ROW_BUTTON}
        >
          <TabKindGlyph
            tab={tab}
            named={false}
            {...(isActive ? {} : { style: { color: legibleTabAccent(tab, chrome.isDark) } })}
          />
          <span id={kindId} hidden>
            {tabKindName(tab)}
          </span>
          {tab.locked ? <TabLockIcon /> : null}
          <span className="truncate">{tab.name}</span>
          {beside ? (
            <span className="flex shrink-0 items-center text-brand-700 dark:text-brand-300">
              <SideBySideIcon size={12} />
              <span className="sr-only">, open side by side</span>
            </span>
          ) : null}
        </button>
      )}
      <TabPresenceStack
        participants={participants}
        selfId={tabs.selfId}
        selfRole={tabs.selfRole}
        followingId={tabs.followingId}
        followerCount={tabs.followerCount}
        onOpenCollaborators={tabs.onOpenCollaborators}
      />
      {(isActive || chrome.menuFor === tab.id) && !isEditing && !readOnly ? (
        <EllipsisMenuButton
          open={chrome.menuFor === tab.id}
          onToggle={() => chrome.setMenuFor(chrome.menuFor === tab.id ? null : tab.id)}
          onClose={() => chrome.setMenuFor(null)}
          canvas={tabs.canvasActions}
          {...chrome.tabMenuProps(tab, () => chrome.setMenuFor(null))}
        />
      ) : null}
    </li>
  );
}
