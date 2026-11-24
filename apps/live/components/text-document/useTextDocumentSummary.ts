'use client';

// The outline's summary (docs/specs/034-text-documents/links-and-navigation.md "The summary"): the text document's
// description, read live from the document map (anyone's write shows at once); an Editor writes it in place, kept as one
// write outside the writing's undo, Escape keeping the old text, counted when it changed.
import { useCallback, useState, useSyncExternalStore, type RefObject } from 'react';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

export type TextDocumentSummary = {
  readonly text: string;
  /** Whether this session may write it (an Editor's). */
  readonly canEdit: boolean;
  /** The field is open in place. */
  readonly editing: boolean;
  edit: () => void;
  /** The text typed, or null to keep the old one (Escape). */
  finish: (text: string | null) => void;
};

const noSubscription = () => () => {};

export function useTextDocumentSummary({
  liveDoc,
  ready,
  canEdit,
}: {
  liveDoc: RefObject<Y.Doc | null>;
  ready: boolean;
  canEdit: boolean;
}): TextDocumentSummary {
  const subscribe = useCallback(
    (notify: () => void) => {
      const doc = liveDoc.current;
      if (!ready || !doc) return noSubscription();
      const meta = TextDocumentState.metaType(doc);
      meta.observe(notify);
      return () => meta.unobserve(notify);
    },
    [liveDoc, ready],
  );
  const read = useCallback(() => {
    const doc = liveDoc.current;
    return ready && doc ? TextDocumentState.summary(doc) : '';
  }, [liveDoc, ready]);
  const text = useSyncExternalStore(subscribe, read, () => '');
  const [editing, setEditing] = useState(false);

  const edit = useCallback(() => {
    if (canEdit && ready) setEditing(true);
  }, [canEdit, ready]);

  const finish = useCallback(
    (typed: string | null) => {
      if (!editing) return;
      setEditing(false);
      const doc = liveDoc.current;
      if (typed === null || !canEdit || !doc) return;
      if (!TextDocumentState.setSummary(doc, typed)) return;
      track('Tab', 'Changed', 'TextDocumentSummary');
      debugLog('[text-document] summary written', {
        length: TextDocumentState.summary(doc).length,
      });
    },
    [canEdit, editing, liveDoc],
  );

  return { text, canEdit, editing, edit, finish };
}
