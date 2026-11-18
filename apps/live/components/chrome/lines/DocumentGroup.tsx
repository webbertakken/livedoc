'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { MenuErrorBoundary } from '@/components/primitives/MenuErrorBoundary';
import { ToolbarGroup, ToolbarPart } from '@/components/chrome/ToolbarGroup';
import { track } from '@/lib/telemetry';
import type { Participant } from '@/lib/identity';
import { newTabMode } from '@/lib/new-tab-seed';
import { ActiveTabSegment } from './ActiveTabSegment';
import { AddTabMenu } from './AddTabMenu';
import { DocumentName, type DocumentNameProps } from './DocumentName';
import { TabList } from './TabList';
import { ContributorsButton, TabStackButton } from './TabListButtons';
import { useTabsChrome, type TabsChromeProps } from './tabs-chrome';

// The tab menu at the canvas's right-click point loads with the first right-click (it and its icons are a large block).
const PortalMenu = dynamic(() => import('../TabPortalMenu').then((m) => m.PortalMenu), {
  ssr: false,
});

// Everyone else in the document, once each, in the order the tabs list them.
function othersHere(byTab: Map<string, Participant[]>, selfId: string): Participant[] {
  const seen = new Map<string, Participant>();
  for (const people of byTab.values())
    for (const p of people) if (p.id !== selfId && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

type Opener = { from: 'stack' | 'people'; button: HTMLElement };

// The document group, the bottom line's right (docs/specs/007-editor/toolbar-layout.md "The bottom line"): the
// document's share-state icon, name and role pill; the active tab, holding the tab stack; the contributors; Add tab, whose
// menu adds a Tab, a Board, a Sheet or a Dashboard (AddTabMenu). The stack and the contributors open the same tab
// list.
export function DocumentGroup({ name, tabs }: { name: DocumentNameProps; tabs: TabsChromeProps }) {
  const chrome = useTabsChrome(tabs);
  const [opener, setOpener] = useState<Opener | null>(null);
  const people = useMemo(
    () => othersHere(tabs.participantsByTab, tabs.selfId),
    [tabs.participantsByTab, tabs.selfId],
  );
  const inScope = tabs.isOutOfScope
    ? tabs.tabs.filter((t) => !tabs.isOutOfScope!(t.id)).length
    : tabs.tabs.length;
  const readOnly = tabs.readOnly ?? false;
  const { activeTab } = chrome;

  const toggle = (from: Opener['from']) => (button: HTMLElement) => {
    if (opener?.from === from) {
      setOpener(null);
      return;
    }
    track('UI', 'Opened', from === 'stack' ? 'TabListStack' : 'TabListPeople');
    setOpener({ from, button });
  };
  // Nobody left to show: a list the contributors opened closes with them.
  const open = opener?.from === 'people' && people.length === 0 ? null : opener;
  const stack = { count: inScope, open: open?.from === 'stack', onToggle: toggle('stack') };

  return (
    <>
      <ToolbarGroup
        label="Document"
        data-document-group=""
        data-region="tabs"
        data-floating-panel=""
        className="pointer-events-auto ml-auto min-w-0"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ToolbarPart className="min-w-0">
          <DocumentName {...name} />
        </ToolbarPart>
        {/* A spreadsheet's tabs are its sheet bar, at the foot of its grid. */}
        {tabs.spreadsheet ? null : (
          <ToolbarPart className="shrink-0">
            {/* The tab stack rides in the active tab: its name, glyph and count are one button. */}
            {activeTab ? (
              <ActiveTabSegment tab={activeTab} tabs={tabs} chrome={chrome} stack={stack} />
            ) : (
              <TabStackButton name="Tabs" {...stack} />
            )}
          </ToolbarPart>
        )}
        <ToolbarPart className="shrink-0">
          {people.length > 0 ? (
            <ContributorsButton
              people={people}
              open={open?.from === 'people'}
              onToggle={toggle('people')}
            />
          ) : null}
          {readOnly || tabs.spreadsheet ? null : (
            <AddTabMenu onAdd={tabs.onAdd} tabMode={newTabMode(activeTab)} />
          )}
        </ToolbarPart>
      </ToolbarGroup>
      {open ? (
        <TabList
          tabs={tabs}
          chrome={chrome}
          opener={open.button}
          peopleHere={people.length}
          onClose={() => setOpener(null)}
        />
      ) : null}
      {tabs.canvasMenu && !readOnly && activeTab && tabs.onCloseCanvasMenu && tabs.canvasActions ? (
        // A fault inside the menu closes the menu, not the editor.
        <MenuErrorBoundary onError={tabs.onCloseCanvasMenu}>
          <PortalMenu
            point={tabs.canvasMenu}
            onClose={tabs.onCloseCanvasMenu}
            canvas={tabs.canvasActions}
            {...chrome.tabMenuProps(activeTab, tabs.onCloseCanvasMenu)}
          />
        </MenuErrorBoundary>
      ) : null}
    </>
  );
}
