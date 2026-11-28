'use client';

// File > Details (docs/specs/034-text-documents/files-and-print.md "Details"): the shell's dialog, read only, for every
// level. The shell's rows (owner, location, created, modified) come first, then the document's own: its format, the
// stored writing's size as it is now, and the word count's statistics, counted as it opens. The last edit is read
// from LiveDoc as it opens; until it is, and where it cannot be, Modified says the last save.
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { OfficeDetailsDialog } from '@/components/office/OfficeDetailsDialog';
import { formatBytes } from '@/app/explorer/details/details-format';
import { apiReadTextDocumentLastEdit } from '@/lib/api/text-document-versions';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  officeDetailsRows,
  type OfficeDetailsRow,
  type OfficeDocumentFacts,
  type OfficeModified,
  type OfficeWhen,
} from '@/lib/office/office-details';
import { track } from '@/lib/telemetry';
import { countWriting } from '@/lib/text-document/text-document-word-count';

/** File > Details's item. */
export const DETAILS_ITEM = 'details';

const FORMAT_WORDS: Record<TextDocumentFormat, string> = {
  odf: 'OpenDocument text (.odt)',
  ooxml: 'Word document (.docx)',
};

const number = new Intl.NumberFormat();

/** What the document says of itself as the dialog opens. */
type Counted = {
  readonly bytes: number;
  readonly pages: number | null;
  readonly words: number;
  readonly characters: number;
  readonly charactersExcludingSpaces: number;
};

/** The document's own rows: format, size, pages where laid out, and the word count's. */
export function textDocumentDetailsRows(
  format: TextDocumentFormat,
  counted: Counted,
  locale?: string,
): OfficeDetailsRow[] {
  return [
    { label: 'Format', value: FORMAT_WORDS[format] },
    { label: 'Size', value: formatBytes(counted.bytes, locale) },
    ...(counted.pages === null ? [] : [{ label: 'Pages', value: number.format(counted.pages) }]),
    { label: 'Words', value: number.format(counted.words) },
    { label: 'Characters', value: number.format(counted.characters) },
    {
      label: 'Characters excluding spaces',
      value: number.format(counted.charactersExcludingSpaces),
    },
  ];
}

export function useTextDocumentDetails({
  view,
  doc,
  facts,
  format,
  pages,
  where,
  local,
  onDone,
  when,
}: {
  /** The body's editor. */
  view: EditorView | null;
  /** The live writing, whose stored state is the size. */
  doc: RefObject<Y.Doc | null>;
  /** The shell's facts; null where the editor page hands none (the other pane of a split): no Details there. */
  facts: OfficeDocumentFacts | null;
  format: TextDocumentFormat;
  /** The pages laid out; null where there are none. */
  pages: number | null;
  where: TextDocumentScope;
  /** In This Browser: LiveDoc records no edits of it. */
  local: boolean;
  /** Hands the focus back to the writing. */
  onDone: () => void;
  when?: OfficeWhen;
}) {
  const [counted, setCounted] = useState<Counted | null>(null);
  const [modified, setModified] = useState<OfficeModified | null>(null);
  const body = view && !view.isDestroyed ? view : null;

  const open = useCallback(() => {
    if (!body) return;
    track('UI', 'Used', 'TextDocumentDetails');
    const live = doc.current;
    const counts = countWriting(body.state.doc);
    const bytes = live ? Y.encodeStateAsUpdate(live).byteLength : 0;
    debugLog('[text-document] details', { words: counts.words, bytes });
    setModified(null);
    setCounted({ ...counts, bytes, pages });
  }, [body, doc, pages]);

  // The last edit, read once per opening; a refusal leaves the last save's time.
  const { ownerId, documentId, tabId, shareCode } = where;
  const opened = counted !== null;
  useEffect(() => {
    if (!opened || local) return undefined;
    let current = true;
    apiReadTextDocumentLastEdit({ ownerId, documentId, tabId, shareCode }).then(
      (edit) => {
        if (current && edit) setModified({ at: edit.at, by: edit.editor.name });
      },
      (error: unknown) =>
        debugLog('[text-document] details last edit unread', { error: String(error) }),
    );
    return () => {
      current = false;
    };
  }, [opened, local, ownerId, documentId, tabId, shareCode]);

  const actions = useMemo(
    (): OfficeActions => (body && facts ? { [DETAILS_ITEM]: { run: open } } : {}),
    [body, facts, open],
  );

  const close = () => {
    setCounted(null);
    onDone();
  };
  const dialog =
    counted && facts ? (
      <OfficeDetailsDialog
        rows={[
          ...officeDetailsRows(facts, modified, when),
          ...textDocumentDetailsRows(format, counted, when?.locale),
        ]}
        onClose={close}
      />
    ) : null;
  return { actions, dialog };
}
