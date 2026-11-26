'use client';

// A mark's Properties (docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties): Format > Properties opens
// the side panel on the right, following the selection; its subject changed is one step of the person's undo on its
// page; "Make this look the default" gives its kind's tool its look. Marks are Reviewing's: outside it the panel is
// closed and Format > Properties is not offered. Find's results opening on the right closes it, as it closes them.
import { useMemo, useState } from 'react';
import type { Mark } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import type { PdfChangeableStore } from './pdf-changeable-marks';
import { MARK_KIND_NAMES } from './pdf-mark-change';
import { changeSubject, defaultLook, mayDefaultLook } from './pdf-mark-properties';
import { MARK_PROPERTIES } from './pdf-menus';
import type { PdfDocumentOpen } from './usePdfDocument';
import { usePdfChosenMarks } from './usePdfChosenMarks';
import { fileOwnOf, type PdfMarksChosen } from './usePdfMarkSelection';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'pages' | 'binding' | 'undo'>;

export type PdfMarkProperties = {
  // Whether the panel shows now.
  readonly open: boolean;
  readonly close: () => void;
  // The one mark selected; null with none or several.
  readonly mark: Mark | null;
  // The subject typed, made the mark's.
  readonly setSubject: (typed: string) => void;
  // "Make this look the default"; null where the mark's kind takes none.
  readonly makeDefault: (() => void) | null;
  readonly actions: OfficeActions;
  // Changes each time a person opens the panel: focus moves into it.
  readonly focusNonce: number;
};

export function usePdfMarkProperties({
  ready,
  marks,
  marking,
  chosen,
  covered,
  onOpen,
}: {
  ready: Ready | null;
  marks: PdfChangeableStore | null;
  // Whether marks may be changed now: Reviewing, for a session that reviews.
  marking: boolean;
  chosen: PdfMarksChosen | null;
  // Whether another panel holds the right now: Find's results.
  covered: boolean;
  // The panel opened: whatever held the right gives it up.
  onOpen: () => void;
}): PdfMarkProperties {
  const [opened, setOpened] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [wasCovered, setWasCovered] = useState(covered);
  // Find's results taking the right close the panel; their closing does not open it again.
  if (covered !== wasCovered) {
    setWasCovered(covered);
    if (covered) setOpened(false);
  }
  const { byPage, page, selected } = usePdfChosenMarks({
    pages: ready?.pages ?? [],
    marks,
    chosen,
  });
  const mark = selected.length === 1 ? selected[0]! : null;
  const open = opened && marking && ready !== null;

  return useMemo((): PdfMarkProperties => {
    const close = () => setOpened(false);
    const setSubject = (typed: string) => {
      if (!ready || !page || !mark) return;
      const changed = ready.undo.step({ page: page.name }, () =>
        changeSubject(ready.binding.doc, mark.id, typed, Date.now(), fileOwnOf(byPage, page.name)),
      );
      if (!changed) return;
      debugLog(`[pdf] mark-subject kind=${mark.kind} cleared=${changed.cleared}`);
      track('Pdf', 'Changed', 'Mark.Subject');
    };
    const makeDefault =
      mark && mayDefaultLook(mark)
        ? () => {
            defaultLook(mark);
            debugLog(`[pdf] look-defaulted kind=${mark.kind}`);
            track('Pdf', 'Changed', `LookDefault.${MARK_KIND_NAMES[mark.kind]}`);
          }
        : null;
    const actions: OfficeActions =
      ready && marking
        ? {
            [MARK_PROPERTIES]: {
              run: () => {
                if (opened) return close();
                track('UI', 'Opened', 'PdfDocumentPanelProperties');
                setOpened(true);
                setFocusNonce((n) => n + 1);
                onOpen();
              },
              checked: open,
            },
          }
        : {};
    return { open, close, mark, setSubject, makeDefault, actions, focusNonce };
  }, [ready, marking, page, mark, byPage, opened, open, onOpen, focusNonce]);
}
