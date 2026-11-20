'use client';

// The page (docs/specs/034-text-documents/page-layout.md "Page setup", "Pageless"): the first section and pageless read
// live, a margin dragged on the ruler, File > Page setup, Format > Page orientation and Format > Switch to pageless
// format, and Set as default.
import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { indentUnit } from '@/lib/text-document/indent-units';
import { useTextDocumentPage } from '@/lib/text-document/text-document-page';
import { saveDefaultPage } from '@/lib/text-document/text-document-page-defaults';
import { applyPage, type PageChange } from '@/lib/text-document/text-document-page-setup';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from '@/lib/text-document/text-document-undo';
import { TextDocumentPageOrientationDialog } from './TextDocumentPageOrientationDialog';
import { TextDocumentPageSetupDialog } from './TextDocumentPageSetupDialog';

export const PAGE_SETUP_ITEM = 'page-setup';
export const PAGE_ORIENTATION_ITEM = 'page-orientation';
export const PAGELESS_ITEM = 'switch-to-pageless';
export const TO_PAGELESS = 'Switch to Pageless format';
export const TO_PAGES = 'Switch to Pages format';

type Open = { which: 'setup' | 'orientation'; nonce: number } | null;
type Counted = 'TextDocumentPageSetup' | 'TextDocumentPageOrientation';

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
  const { section, pageless } = useTextDocumentPage(liveDoc, format, ready);
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

  // Sets what changed; nothing changed changes nothing and counts nothing.
  const apply = useCallback(
    ({ setup, pageless: next }: PageChange, type: Counted) => {
      const doc = liveDoc.current;
      if (!doc || !view || view.isDestroyed) return;
      const change: PageChange = {
        ...(setup && !PageSetup.equal(setup, section.setup) ? { setup } : {}),
        ...(next !== undefined && next !== pageless ? { pageless: next } : {}),
      };
      if (Object.keys(change).length === 0) return;
      applyPage(view, doc, format, change);
      if (change.setup) track('Tab', 'Changed', type);
      if (change.pageless !== undefined) track('Tab', 'Changed', 'TextDocumentPageless');
    },
    [liveDoc, view, section.setup, pageless, format],
  );

  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    const opening = (which: 'setup' | 'orientation') => () =>
      setOpen((o) => ({ which, nonce: (o?.nonce ?? 0) + 1 }));
    return {
      [PAGE_SETUP_ITEM]: { run: opening('setup') },
      [PAGE_ORIENTATION_ITEM]: { run: opening('orientation') },
      [PAGELESS_ITEM]: {
        run: () => {
          apply({ pageless: !pageless }, 'TextDocumentPageSetup');
          view.focus();
        },
        label: pageless ? TO_PAGES : TO_PAGELESS,
      },
    };
  }, [writes, view, pageless, apply]);

  const close = () => {
    setOpen(null);
    view?.focus();
  };

  const dialog =
    open?.which === 'setup' ? (
      <TextDocumentPageSetupDialog
        key={open.nonce}
        open
        setup={section.setup}
        pageless={pageless}
        unit={unit}
        onClose={close}
        onApply={(page) => {
          apply(page, 'TextDocumentPageSetup');
          close();
        }}
        onSaveDefault={(page) => {
          // Counted before it is kept, as every preference change is.
          track('UI', 'Changed', 'TextDocumentPageDefault');
          saveDefaultPage(page, ownerId);
        }}
      />
    ) : open?.which === 'orientation' ? (
      <TextDocumentPageOrientationDialog
        key={open.nonce}
        open
        orientation={section.setup.width > section.setup.height ? 'landscape' : 'portrait'}
        onClose={close}
        onApply={(orientation) => {
          apply(
            { setup: PageSetup.oriented(section.setup, orientation) },
            'TextDocumentPageOrientation',
          );
          close();
        }}
      />
    ) : null;

  return { section, pageless, setSetup, actions, dialog };
}
