'use client';

// The outline's body (docs/specs/034-text-documents/links-and-navigation.md "The outline", "Document tabs in the
// outline"): the summary ("The summary"), then the document tabs, indented by depth, the shown one marked, + adding one for an Editor, dragged to reorder
// or nest them ("A tab's menu", Dragging); under the shown tab
// its headings, indented by level, following the writing as anyone changes it; a press on a tab shows it, and a press
// on a heading puts the caret at its start and brings it to the top of the view. The office shell's left panel frames it.
import { useCallback, useId, useMemo, useSyncExternalStore } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { PlusIcon, Tooltip } from '@livedoc/ui';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { DocumentTabList, type Style } from '@livedoc/text-documents';
import type { TextDocumentChanges } from '@/lib/text-document/text-document-changes';
import {
  textDocumentHeadings,
  type TextDocumentHeading,
} from '@/lib/text-document/text-document-outline';
import type { TextDocumentTabs } from './useTextDocumentTabs';
import { TextDocumentOutlineTab } from './TextDocumentOutlineTab';
import { useTextDocumentTabDrag } from './useTextDocumentTabDrag';
import { TextDocumentOutlineSummary } from './TextDocumentOutlineSummary';
import type { TextDocumentSummary } from './useTextDocumentSummary';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OfficeEmojiDialog } from '@/components/office/OfficeEmojiDialog';

export const OUTLINE_EMPTY = 'Headings you add to the document will appear here.';
export const OUTLINE_TABS_TITLE = 'Document tabs';
export const ADD_TAB_LABEL = 'Add tab';

// Indent per heading level below the first, and per tab depth, in px.
const LEVEL_INDENT_PX = 12;
const ROW =
  'block w-full truncate rounded-control py-1 pr-2 text-left text-body outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

function goTo(view: EditorView, heading: TextDocumentHeading) {
  const { doc } = view.state;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, heading.pos)));
  const { node } = view.domAtPos(heading.pos);
  const element = node instanceof Element ? node : node.parentElement;
  element?.closest('p')?.scrollIntoView?.({ block: 'start' });
  view.focus();
}

function Headings({
  view,
  headings,
  indent,
}: {
  view: EditorView | null;
  headings: readonly TextDocumentHeading[];
  indent: number;
}) {
  if (headings.length === 0)
    return (
      <p className="py-1 pr-2 text-body text-(--office-muted)" style={{ paddingLeft: 8 + indent }}>
        {OUTLINE_EMPTY}
      </p>
    );
  return (
    <ul aria-label="Headings">
      {headings.map((heading, i) => (
        <li key={heading.pos}>
          <button
            type="button"
            // Opening the outline starts at the shown tab's first heading.
            {...(i === 0 ? { [OFFICE_PANEL_START]: '' } : {})}
            onClick={() => view && goTo(view, heading)}
            style={{ paddingLeft: 8 + indent + (heading.level - 1) * LEVEL_INDENT_PX }}
            className={ROW}
          >
            {heading.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TextDocumentOutline({
  view,
  changes,
  readStyles,
  tabs,
  summary,
}: {
  view: EditorView | null;
  changes: TextDocumentChanges;
  // The live state's styles, read again as the writing changes.
  readStyles: () => readonly Style[];
  tabs: TextDocumentTabs;
  summary: TextDocumentSummary;
}) {
  const titleId = useId();
  const drag = useTextDocumentTabDrag(tabs);
  // The shown tab's body as it is now, read again whenever anyone changes it; drawn with the panel, so its first
  // entry can take the focus the panel hands it.
  const doc = useSyncExternalStore(
    changes.subscribe,
    useCallback(() => view?.state.doc ?? null, [view]),
    () => null,
  );
  const headings = useMemo(
    () => (doc ? textDocumentHeadings(doc, readStyles()) : []),
    [doc, readStyles],
  );

  return (
    <>
      <TextDocumentOutlineSummary summary={summary} />
      <section aria-labelledby={titleId}>
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <h3 id={titleId} className="text-panel-title text-(--office-muted)">
            {OUTLINE_TABS_TITLE}
          </h3>
          {tabs.canAdd && (
            <Tooltip label={ADD_TAB_LABEL}>
              <button
                type="button"
                aria-label={ADD_TAB_LABEL}
                onClick={tabs.add}
                className="grid size-row place-items-center rounded-full outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
              >
                <PlusIcon className="size-icon-row" aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
        <ul aria-labelledby={titleId}>
          {tabs.list.map((tab, i) => {
            const current = tab.id === tabs.shown;
            const indent = tab.depth * LEVEL_INDENT_PX;
            return (
              <li key={tab.id}>
                <TextDocumentOutlineTab
                  tab={tab}
                  tabs={tabs}
                  indent={indent}
                  rowClass={ROW}
                  drag={drag.row(tab.id, DocumentTabList.subtreeEnd(tabs.list, i) > i + 1)}
                  dragged={drag.dragging === tab.id}
                  dropLine={drag.line?.target === tab.id ? drag.line.place : null}
                  // Opening the outline starts at the shown tab when it has no heading.
                  start={current && headings.length === 0}
                />
                {current && (
                  <Headings view={view} headings={headings} indent={indent + LEVEL_INDENT_PX} />
                )}
              </li>
            );
          })}
        </ul>
        <p aria-live="polite" className="sr-only">
          {tabs.said}
        </p>
        <TabDialogs tabs={tabs} />
      </section>
    </>
  );
}

/** What a tab's menu asks: its emoji, or whether to delete it with its subtabs. */
function TabDialogs({ tabs }: { tabs: TextDocumentTabs }) {
  const { asking } = tabs;
  if (asking?.kind === 'emoji')
    return <OfficeEmojiDialog onClose={tabs.cancelAsking} onPick={tabs.pickEmoji} />;
  if (asking?.kind !== 'delete') return null;
  const at = tabs.list.findIndex((t) => t.id === asking.id);
  if (at < 0) return null;
  const subtabs = DocumentTabList.subtreeEnd(tabs.list, at) - at - 1;
  return (
    <OfficeDialog
      open
      onClose={tabs.cancelAsking}
      title={`Delete "${tabs.list[at]!.name}"?`}
      primary={{ label: 'Delete', onPress: tabs.confirmDelete }}
    >
      <p className="text-body">
        {subtabs === 0
          ? 'This tab and its writing will be deleted.'
          : `This tab, its ${subtabs === 1 ? 'subtab' : `${subtabs} subtabs`} and their writing will be deleted.`}
      </p>
    </OfficeDialog>
  );
}
