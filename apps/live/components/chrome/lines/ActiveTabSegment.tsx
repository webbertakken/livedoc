'use client';

import { tabKindName, tabKindNoun, type Tab } from '@livedoc/document';
import { HoverCard } from '@livedoc/ui';
import { NameEditor } from '@/components/primitives/NameEditor';
import { EllipsisMenuButton } from '@/components/chrome/EllipsisMenuButton';
import { TabLockIcon } from '@/components/chrome/tab-bar-icons';
import { TabKindGlyph } from '@/components/chrome/editor-mode/TabKindGlyph';
import { TabModeIcon } from '@/components/chrome/editor-mode/TabModeIcon';
import { MenuNameSlot } from '@/components/plan/menu-name-slot';
import { activeTabTint } from './TabListRow';
import { TabStackButton } from './TabListButtons';
import type { TabsChrome, TabsChromeProps } from './tabs-chrome';

// The active tab in the document group (docs/specs/007-editor/toolbar-layout.md "The bottom line", "The tab's name"): a
// tinted segment (the tab's accent, its inset ring; never a bordered pill), its kind glyph, the tab stack and its tab
// menu. It never shortens. The kind glyph renames the tab in place for someone who may change the document's tabs, and
// names the tab's kind (editor-modes.md "A tab's kind is always findable") for everyone; the
// tab stack (its name, a stack glyph and the count) opens the tab list. `data-tour-id="active-tab"`: the Diagram
// tour's Tabs step rings it with its ⋯ menu.
export function ActiveTabSegment({
  tab,
  tabs,
  chrome,
  stack,
}: {
  tab: Tab;
  tabs: TabsChromeProps;
  chrome: TabsChrome;
  // The tab stack's count and the tab list's opener (DocumentGroup).
  stack: { count: number; open: boolean; onToggle: (button: HTMLElement) => void };
}) {
  const readOnly = tabs.readOnly ?? false;
  const isEditing = chrome.editingId === tab.id && !readOnly;
  return (
    <div
      data-tour-id="active-tab"
      data-active-tab-segment=""
      onContextMenu={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              chrome.setMenuFor(tab.id);
            }
      }
      style={isEditing ? undefined : activeTabTint(tab, chrome.isDark)}
      className={`flex h-9 shrink-0 items-center gap-0.5 rounded-md text-[13px] font-medium ${
        isEditing ? '' : `bg-slate-100 pr-1 dark:bg-slate-800 ${readOnly ? 'pl-2' : 'pl-1'}`
      }`}
    >
      {isEditing ? (
        <>
          {/* The slot stays mounted, so a board's portalled title is not torn down by a rename. */}
          <MenuNameSlot />
          <NameEditor
            initial={tab.name}
            onCommit={(name) => {
              tabs.onRename(tab.id, name.trim() || tab.name);
              chrome.setEditingId(null);
            }}
            onCancel={() => chrome.setEditingId(null)}
            className="h-9 w-40 rounded-md bg-white px-2 text-[13px] font-medium text-slate-800 outline-none ring-1 ring-brand-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-brand-400"
          />
        </>
      ) : (
        <>
          {readOnly ? (
            <TabKindGlyph tab={tab} />
          ) : (
            <HoverCard title={tabKindName(tab)} description="Click to rename it.">
              <button
                type="button"
                aria-label={`Rename ${tabKindNoun(tab)}`}
                onClick={() => chrome.setEditingId(tab.id)}
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded outline-none transition touch-target hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:bg-white/10"
              >
                <TabModeIcon tab={tab} />
              </button>
            </HoverCard>
          )}
          {tab.locked ? <TabLockIcon /> : null}
          <MenuNameSlot />
          <TabStackButton name={tab.name} {...stack} />
          {readOnly ? null : (
            <EllipsisMenuButton
              open={chrome.menuFor === tab.id}
              onToggle={() => chrome.setMenuFor(chrome.menuFor === tab.id ? null : tab.id)}
              onClose={() => chrome.setMenuFor(null)}
              canvas={tabs.canvasActions}
              {...chrome.tabMenuProps(tab, () => chrome.setMenuFor(null))}
            />
          )}
        </>
      )}
    </div>
  );
}
