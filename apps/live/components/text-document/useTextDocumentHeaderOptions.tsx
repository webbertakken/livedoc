'use client';

// Headers and footers options (docs/specs/034-text-documents/page-layout.md "Editing headers and footers"): Format >
// Headers & footers and the bar's Header format open it for the edited header's section, else the caret's; Apply sets
// that section or every one as one undo step, and with a header edited enters the one its page now shows. Editors
// only; dimmed without pages laid out.
import { useCallback, useMemo, useRef, useState, useLayoutEffect, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { liveFirstHeaders, TextDocumentState } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { indentUnit } from '@/lib/text-document/indent-units';
import { bodySections } from '@/lib/text-document/pagination/pagination-sections';
import {
  applyHeaderOptions,
  headerMarginMost,
  headerOptionsOf,
  type HeaderOptions,
  type HeaderOptionsScope,
} from '@/lib/text-document/text-document-header-options';
import { TextDocumentHeaderOptionsDialog } from './TextDocumentHeaderOptionsDialog';

/** Format > Headers & footers (text-document-menus.ts). */
export const HEADER_OPTIONS_ITEM = 'headers-and-footers-options';

// What the dialog was opened on: read once, when it opens.
type Opened = {
  readonly nonce: number;
  readonly section: number;
  readonly options: HeaderOptions;
  readonly scopes: readonly HeaderOptionsScope[];
  readonly most: Record<HeaderOptionsScope, number>;
};

export function useTextDocumentHeaderOptions(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  readonly writes: boolean;
  readonly laidOut: boolean;
  /** The section the body's caret is in. */
  readonly caretSection: number;
  /** The header or footer edited, if one is: its section, and its editor, focused again on Cancel. */
  readonly editing: { readonly section: number; readonly view: EditorView } | null;
  /** Runs a change with the edited one left, entering the page's again after (useTextDocumentHeaderEditing). */
  readonly changeAround: (run: () => void) => void;
}) {
  const { view, liveDoc, format, writes, laidOut } = input;
  const [opened, setOpened] = useState<Opened | null>(null);
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });

  const open = useCallback(() => {
    const { view: body, editing, caretSection } = latest.current;
    const doc = liveDoc.current;
    if (!body || !doc) return;
    const sections = bodySections(
      body.state.doc,
      TextDocumentState.section(doc, format).setup,
      liveFirstHeaders(doc),
    );
    const section = Math.min(editing?.section ?? caretSection, sections.setups.length - 1);
    const setup = sections.setups[section]!;
    setOpened((was) => ({
      nonce: (was?.nonce ?? 0) + 1,
      section,
      options: headerOptionsOf(setup, sections.headers[section]),
      scopes: sections.setups.length > 1 ? ['section', 'document'] : ['section'],
      most: { section: headerMarginMost([setup]), document: headerMarginMost(sections.setups) },
    }));
  }, [liveDoc, format]);

  const apply = useCallback(
    (options: HeaderOptions, scope: HeaderOptionsScope) => {
      const { view: body, editing, changeAround } = latest.current;
      const doc = liveDoc.current;
      setOpened(null);
      if (!body || !doc || !opened) return;
      const run = () => {
        const changed = applyHeaderOptions(body, doc, format, {
          section: opened.section,
          scope,
          options,
        });
        if (changed > 0) track('Tab', 'Changed', 'TextDocumentHeaderFooter');
      };
      // A header edited is left first (an empty own one taken away) and entered again after, as the bar does.
      if (editing) changeAround(run);
      else {
        run();
        body.focus();
      }
    },
    [liveDoc, format, opened],
  );

  const close = () => {
    setOpened(null);
    const { editing, view: body } = latest.current;
    (editing?.view ?? body)?.focus();
  };

  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    return { [HEADER_OPTIONS_ITEM]: { run: open, disabled: !laidOut } };
  }, [writes, view, open, laidOut]);

  const unit = useMemo(() => indentUnit(), []);
  const dialog = opened ? (
    <TextDocumentHeaderOptionsDialog
      key={opened.nonce}
      open
      options={opened.options}
      unit={unit}
      scopes={opened.scopes}
      mostOf={(scope) => opened.most[scope]}
      onApply={apply}
      onClose={close}
    />
  ) : null;

  return { actions, open, dialog };
}
