'use client';

// One document tab in the outline (docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the
// outline", "A tab's menu"): its row shows it; its Tab options button (on hover and focus, always on the shown tab)
// opens its menu; an Editor drags it by the row onto another tab; Rename turns its name into a field in place, Enter or leaving keeping the name, Escape the old one.
import { useState, type KeyboardEvent } from 'react';
import { EllipsisIcon, Tooltip } from '@livedoc/ui';
import type { DocumentTab, DocumentTabDropPlace } from '@livedoc/text-documents';
import { OfficeMenuPanel } from '@/components/office/OfficeMenuPanel';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { OfficePopup } from '@/components/office/OfficePopup';
import { tabMenuEntries } from '@/lib/text-document/text-document-tab-menu';
import type { TextDocumentTabs } from './useTextDocumentTabs';
import type { TabDragRow } from './useTextDocumentTabDrag';

export const TAB_OPTIONS_LABEL = 'Tab options';
export const TAB_NAME_LABEL = 'Tab name';

const noShortcuts = () => null;

// The drop line's indent for into, one depth deeper, in px.
const INTO_INDENT_PX = 12;
// The room the row keeps clear at its end for its options button: the chip step (24 px), its 4 px inset and 4 more.
const OPTIONS_ROOM_PX = 32;

export function TextDocumentOutlineTab({
  tab,
  tabs,
  indent,
  rowClass,
  drag,
  dragged = false,
  dropLine = null,
  start = false,
}: {
  tab: DocumentTab;
  tabs: TextDocumentTabs;
  indent: number;
  rowClass: string;
  // Dragging it onto another row, and where a drag over this row would land (A tab's menu, Dragging).
  drag?: TabDragRow;
  dragged?: boolean;
  dropLine?: DocumentTabDropPlace | null;
  // Where focus starts when the outline is opened (links-and-navigation.md "The outline").
  start?: boolean;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = tab.id === tabs.shown;

  if (tabs.renaming === tab.id) {
    const done = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') tabs.finishRename(tab.id, event.currentTarget.value);
      else if (event.key === 'Escape') {
        event.preventDefault();
        tabs.finishRename(tab.id, null);
      }
    };
    return (
      <input
        aria-label={TAB_NAME_LABEL}
        defaultValue={tab.name}
        maxLength={100}
        // The field takes the focus it was opened for, its text selected to type over.
        ref={(input) => {
          if (input && document.activeElement !== input) {
            input.focus();
            input.select();
          }
        }}
        onKeyDown={done}
        onBlur={(event) => tabs.finishRename(tab.id, event.currentTarget.value)}
        style={{ marginLeft: indent }}
        className="w-[calc(100%-0.5rem)] rounded-control border border-(--office-focus) bg-(--office-menu) px-2 py-1 text-body text-(--office-ink) outline-none"
      />
    );
  }

  return (
    <div
      {...drag}
      data-drop={dropLine ?? undefined}
      className={`group relative flex items-center ${dragged ? 'opacity-50' : ''}`}
    >
      {dropLine && (
        <span
          aria-hidden
          data-testid="tab-drop-line"
          style={{ left: 8 + indent + (dropLine === 'into' ? INTO_INDENT_PX : 0) }}
          className={`pointer-events-none absolute right-1 h-0.5 rounded-full bg-(--office-focus) ${
            dropLine === 'before' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}
      <button
        type="button"
        aria-current={current ? 'page' : undefined}
        {...(start ? { [OFFICE_PANEL_START]: '' } : {})}
        onClick={() => tabs.show(tab.id)}
        style={{ paddingLeft: 8 + indent, paddingRight: OPTIONS_ROOM_PX }}
        className={`${rowClass} ${current ? 'bg-(--office-pressed) font-medium text-(--office-pressed-ink)' : ''}`}
      >
        {tab.emoji && (
          <span aria-hidden className="mr-1.5">
            {tab.emoji}
          </span>
        )}
        {tab.name}
      </button>
      <Tooltip label={TAB_OPTIONS_LABEL}>
        <button
          ref={setTrigger}
          type="button"
          aria-label={`${TAB_OPTIONS_LABEL}: ${tab.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className={`absolute right-1 grid size-chip place-items-center rounded-full outline-none hover:bg-(--office-hover) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--office-focus) group-hover:opacity-100 ${
            current || open ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <EllipsisIcon className="size-icon-row" aria-hidden />
        </button>
      </Tooltip>
      {open ? (
        <OfficePopup anchor={trigger}>
          <OfficeMenuPanel
            entries={tabMenuEntries(tabs.canEditTabs)}
            actions={tabs.menuActions(tab.id)}
            shortcutOf={noShortcuts}
            trigger={trigger}
            initialFocus="first"
            placement="popup"
            label={TAB_OPTIONS_LABEL}
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </OfficePopup>
      ) : null}
    </div>
  );
}
