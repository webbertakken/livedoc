'use client';

// Page numbers put in (docs/specs/034-text-documents/page-layout.md "Page numbers"): Insert > Page numbers' presets for
// the whole document, Page count at the caret, and the Page numbers dialog from More options, Format > Page numbers
// and the bar, for the edited header's section, else the caret's. Editors only; the presets and the dialog are dimmed
// without pages laid out.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  applyPageNumbers,
  insertPageCount,
  PAGE_NUMBER_PRESETS,
  type PageNumberChoice,
  type PageNumberScope,
} from '@/lib/text-document/text-document-page-numbers';
import { SECTION_BREAK } from '@livedoc/text-documents';
import {
  TextDocumentPageNumbersDialog,
  type PageNumberOptions,
} from './TextDocumentPageNumbersDialog';

/** Insert > Page numbers' and Format's items (text-document-menus.ts). */
export const PAGE_COUNT_ITEM = 'page-count';
export const PAGE_NUMBERS_MORE_ITEM = 'page-numbers-more';
export const PAGE_NUMBERS_OPTIONS_ITEM = 'page-numbers-options';

type Opened = {
  readonly nonce: number;
  readonly section: number;
  readonly start: number | undefined;
  readonly scopes: readonly PageNumberScope[];
};

export function useTextDocumentPageNumbers(input: {
  readonly view: EditorView | null;
  /** Where Page count goes: the header or footer edited, else the body. */
  readonly activeView: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  readonly writes: boolean;
  readonly laidOut: boolean;
  readonly caretSection: number;
  readonly editing: { readonly section: number; readonly view: EditorView } | null;
  /** Runs a change with the edited one left, entering the page's again after. */
  readonly changeAround: (run: () => void) => void;
}) {
  const { view, activeView, liveDoc, format, writes, laidOut } = input;
  const [opened, setOpened] = useState<Opened | null>(null);
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });

  // One choice put in, around the header edited; counted when something changed.
  const put = useCallback(
    (choice: PageNumberChoice) => {
      const { view: body, editing, changeAround } = latest.current;
      const doc = liveDoc.current;
      if (!body || !doc) return;
      const run = () => {
        if (applyPageNumbers(body, doc, format, choice))
          track('Element', 'Added', 'TextDocumentPageNumbers');
      };
      if (editing) changeAround(run);
      else {
        run();
        body.focus();
      }
    },
    [liveDoc, format],
  );

  const open = useCallback(() => {
    const { view: body, editing, caretSection } = latest.current;
    const doc = liveDoc.current;
    if (!body || !doc) return;
    const starts: (number | undefined)[] = [TextDocumentState.section(doc, format).numberStart];
    body.state.doc.forEach((node) => {
      if (node.type.name !== SECTION_BREAK) return;
      const start = (node.attrs as { numberStart?: number | null }).numberStart;
      starts.push(typeof start === 'number' ? start : undefined);
    });
    const section = Math.min(editing?.section ?? caretSection, starts.length - 1);
    setOpened((was) => ({
      nonce: (was?.nonce ?? 0) + 1,
      section,
      start: starts[section],
      scopes: starts.length > 1 ? ['section', 'document'] : ['section'],
    }));
  }, [liveDoc, format]);

  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    const presets = Object.fromEntries(
      PAGE_NUMBER_PRESETS.map((preset) => [
        preset.item,
        {
          run: () =>
            put({
              position: preset.position,
              firstPage: preset.firstPage,
              scope: 'document',
              section: 0,
            }),
          disabled: !laidOut,
        },
      ]),
    );
    return {
      ...presets,
      [PAGE_COUNT_ITEM]: {
        run: () => {
          if (activeView && insertPageCount(activeView)) {
            track('Element', 'Added', 'TextDocumentPageCount');
            activeView.focus();
          }
        },
      },
      [PAGE_NUMBERS_MORE_ITEM]: { run: open, disabled: !laidOut },
      [PAGE_NUMBERS_OPTIONS_ITEM]: { run: open, disabled: !laidOut },
    };
  }, [writes, view, activeView, laidOut, put, open]);

  const close = () => {
    setOpened(null);
    const { editing, view: body } = latest.current;
    (editing?.view ?? body)?.focus();
  };

  const dialog = opened ? (
    <TextDocumentPageNumbersDialog
      key={opened.nonce}
      open
      start={opened.start}
      scopes={opened.scopes}
      onClose={close}
      onApply={(options: PageNumberOptions, scope: PageNumberScope) => {
        setOpened(null);
        put({
          ...options,
          scope,
          section: scope === 'document' ? 0 : opened.section,
        });
      }}
    />
  ) : null;

  return { actions, open, dialog };
}
