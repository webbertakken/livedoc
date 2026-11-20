'use client';

// The page's setup (docs/specs/034-text-documents/page-layout.md "Page setup"): the first section read live, a margin
// dragged on the ruler, File > Page setup and Format > Page orientation with their dialogs, and Set as default.
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { indentUnit } from '@/lib/text-document/indent-units';
import { useTextDocumentSection } from '@/lib/text-document/text-document-page';
import { saveDefaultPageSetup } from '@/lib/text-document/text-document-page-defaults';
import { applyPageSetup } from '@/lib/text-document/text-document-page-setup';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from '@/lib/text-document/text-document-undo';
import { TextDocumentPageOrientationDialog } from './TextDocumentPageOrientationDialog';
import { TextDocumentPageSetupDialog } from './TextDocumentPageSetupDialog';

export const PAGE_SETUP_ITEM = 'page-setup';
export const PAGE_ORIENTATION_ITEM = 'page-orientation';

type Open = { which: 'setup' | 'orientation'; nonce: number } | null;

export function useTextDocumentPageSetup({
  view,
  liveDoc,
  format,
  ready,
  writes,
  ownerId,
}: {
  view: EditorView | null;
  liveDoc: RefObject<Y.Doc | null>;
  format: TextDocumentFormat;
  ready: boolean;
  writes: boolean;
  ownerId: string | null;
}) {
  const section = useTextDocumentSection(liveDoc, format, ready);
  const [open, setOpen] = useState<Open>(null);
  const unit = useMemo(() => indentUnit(), []);

  // A margin dragged on the ruler: the first section's setup, one undo step.
  const setSetup = useCallback(
    (setup: PageSetup) => {
      const doc = liveDoc.current;
      if (!doc || !writes) return;
      if (view) startUndoStep(view);
      TextDocumentState.setSection(doc, { ...section, setup }, TEXT_DOCUMENT_PAGE_ORIGIN);
      if (view) startUndoStep(view);
    },
    [liveDoc, section, writes, view],
  );

  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    const opening = (which: 'setup' | 'orientation') => () =>
      setOpen((o) => ({ which, nonce: (o?.nonce ?? 0) + 1 }));
    return {
      [PAGE_SETUP_ITEM]: { run: opening('setup') },
      [PAGE_ORIENTATION_ITEM]: { run: opening('orientation') },
    };
  }, [writes, view]);

  const close = () => {
    setOpen(null);
    view?.focus();
  };
  // Sets what changed over the whole document; a setup unchanged changes nothing and counts nothing.
  const apply = (
    setup: PageSetup,
    type: 'TextDocumentPageSetup' | 'TextDocumentPageOrientation',
  ) => {
    const doc = liveDoc.current;
    if (doc && view && !view.isDestroyed && !PageSetup.equal(setup, section.setup)) {
      applyPageSetup(view, doc, format, setup);
      track('Tab', 'Changed', type);
    }
    close();
  };

  const dialog =
    open?.which === 'setup' ? (
      <TextDocumentPageSetupDialog
        key={open.nonce}
        open
        setup={section.setup}
        unit={unit}
        onClose={close}
        onApply={(setup) => apply(setup, 'TextDocumentPageSetup')}
        onSaveDefault={(setup) => {
          // Counted before it is kept, as every preference change is.
          track('UI', 'Changed', 'TextDocumentPageDefault');
          saveDefaultPageSetup(setup, ownerId);
        }}
      />
    ) : open?.which === 'orientation' ? (
      <TextDocumentPageOrientationDialog
        key={open.nonce}
        open
        orientation={section.setup.width > section.setup.height ? 'landscape' : 'portrait'}
        onClose={close}
        onApply={(orientation) =>
          apply(PageSetup.oriented(section.setup, orientation), 'TextDocumentPageOrientation')
        }
      />
    ) : null;

  return { section, setSetup, actions, dialog };
}
