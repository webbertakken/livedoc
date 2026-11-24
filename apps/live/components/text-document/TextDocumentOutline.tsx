'use client';

// The outline's body (docs/specs/034-text-documents/links-and-navigation.md "The outline", "Document tabs in the
// outline"): the document tabs, indented by depth, the shown one marked, + adding one for an Editor; under the shown tab
// its headings, indented by level, following the writing as anyone changes it; a press on a tab shows it, and a press
// on a heading puts the caret at its start and brings it to the top of the view. The office shell's left panel frames it.
import { useCallback, useId, useMemo, useSyncExternalStore } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { PlusIcon, Tooltip } from '@livedoc/ui';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import type { Style } from '@livedoc/text-documents';
import type { TextDocumentChanges } from '@/lib/text-document/text-document-changes';
import {
  textDocumentHeadings,
  type TextDocumentHeading,
} from '@/lib/text-document/text-document-outline';
import type { TextDocumentTabs } from './useTextDocumentTabs';

export const OUTLINE_EMPTY = 'Headings you add to the document will appear here.';
export const OUTLINE_TABS_TITLE = 'Document tabs';
export const ADD_TAB_LABEL = 'Add tab';

// Indent per heading level below the first, and per tab depth, in px.
const LEVEL_INDENT_PX = 12;
const ROW =
  'block w-full truncate rounded py-1.5 pr-2 text-left text-sm outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

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
      <p className="py-1 pr-2 text-sm text-(--office-muted)" style={{ paddingLeft: 8 + indent }}>
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
}: {
  view: EditorView | null;
  changes: TextDocumentChanges;
  // The live state's styles, read again as the writing changes.
  readStyles: () => readonly Style[];
  tabs: TextDocumentTabs;
}) {
  const titleId = useId();
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
    <section aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <h3 id={titleId} className="text-xs font-medium text-(--office-muted)">
          {OUTLINE_TABS_TITLE}
        </h3>
        {tabs.canAdd && (
          <Tooltip label={ADD_TAB_LABEL}>
            <button
              type="button"
              aria-label={ADD_TAB_LABEL}
              onClick={tabs.add}
              className="grid size-7 place-items-center rounded-full outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
            >
              <PlusIcon className="size-4" aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
      <ul aria-labelledby={titleId}>
        {tabs.list.map((tab) => {
          const current = tab.id === tabs.shown;
          const indent = tab.depth * LEVEL_INDENT_PX;
          return (
            <li key={tab.id}>
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                // Opening the outline starts at the shown tab when it has no heading.
                {...(current && headings.length === 0 ? { [OFFICE_PANEL_START]: '' } : {})}
                onClick={() => tabs.show(tab.id)}
                style={{ paddingLeft: 8 + indent }}
                className={`${ROW} ${current ? 'bg-(--office-pressed) font-medium text-(--office-pressed-ink)' : ''}`}
              >
                {tab.emoji && (
                  <span aria-hidden className="mr-1.5">
                    {tab.emoji}
                  </span>
                )}
                {tab.name}
              </button>
              {current && (
                <Headings view={view} headings={headings} indent={indent + LEVEL_INDENT_PX} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
