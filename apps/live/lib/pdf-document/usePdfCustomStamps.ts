'use client';

// A person's custom stamps in the Stamp tool (docs/specs/035-pdf-documents/custom-stamps.md "Making one", "Placing
// one"): their stamps read once the tool is offered on a deployment that stores files, drawn in the Stamp control's
// grid a category each after Standard and Dynamic, then Create custom stamp…; Create custom stamp, the dialog, opened
// and closed; and a press placing one: its picture sent for the document first, the mark made once it is held, one
// step of the person's undo. A press while a picture is sent places nothing more.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BlobKey } from '@livedoc/document';
import { lucidePlus } from '@livedoc/icons/lucide';
import type { Box, CustomStampRecord, PagePoint } from '@livedoc/pdf-documents';
import type { OfficeGridCell, OfficeGridSection } from '@/components/office/OfficeChoiceGrid';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { customStampPicture, customStampSections, useCustomStamps } from './custom-stamps';
import { CUSTOM_STAMP_COPY } from './make-custom-stamp';
import { addCustomStamp, type StampMade } from './pdf-stamp';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { useStampPictureUrls } from './stamp-picture-urls';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

/** Where a person's custom stamps come from and where a placed one's picture goes. */
export type PdfCustomStampsHome = {
  // The person: whose stamps they are.
  readonly ownerId: string;
  // Sends a picture's bytes for the open document, held before the mark names them (pdf-home.ts `pdfBlobSendOf`).
  readonly send: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
};

/** The Stamp control's Create custom stamp… cell; Insert > Stamp > Custom stamps runs the same. */
export const CREATE_CUSTOM_STAMP_CELL = 'stamp-custom-create';

/** What Create custom stamp, the dialog, is told: whether it is open, whose stamps, and their categories. */
export type CustomStampDialogProps = {
  readonly open: boolean;
  readonly ownerId: string;
  readonly categories: readonly string[];
  readonly onClose: () => void;
  readonly onMade: (stamp: CustomStampRecord) => void;
};

export function usePdfCustomStamps({
  home,
  offered,
  cellOf,
  take,
}: {
  // Null where they are not offered: a deployment without file storage.
  home: PdfCustomStampsHome | null;
  // Whether the Stamp tool is offered now.
  offered: boolean;
  // A stamp's cell in the grid, by its id.
  cellOf: (id: string) => string;
  // Takes a stamp by its id, the Stamp tool in hand.
  take: (id: string) => void;
}) {
  const enabled = home !== null && offered;
  const ownerId = home?.ownerId ?? '';
  const stamps = useCustomStamps(ownerId, enabled);
  const byKey = useMemo(
    () => new Map(stamps.map((stamp) => [stamp.picture.key, stamp] as const)),
    [stamps],
  );
  const read = useCallback(
    (key: BlobKey) => customStampPicture(ownerId, byKey.get(key)!),
    [ownerId, byKey],
  );
  const pictures = useMemo(() => stamps.map((stamp) => stamp.picture), [stamps]);
  const urls = useStampPictureUrls(pictures, enabled ? read : null);
  const [creating, setCreating] = useState(false);
  const sending = useRef(false);

  const openDialog = useCallback(() => {
    track('UI', 'Opened', 'PdfDocumentCustomStampDialog');
    setCreating(true);
  }, []);

  const sections = useMemo(() => customStampSections(stamps), [stamps]);
  const grid = useMemo((): { cells: OfficeGridCell[]; sections: OfficeGridSection[] } => {
    if (!enabled) return { cells: [], sections: [] };
    const cells: OfficeGridCell[] = sections.flatMap(({ stamps: inIt }) =>
      inIt.map((stamp) => {
        return {
          id: cellOf(stamp.id),
          label: stamp.name,
          picture: { src: urls.get(stamp.picture.key) ?? null, name: stamp.name },
        };
      }),
    );
    const create: OfficeGridCell = {
      id: CREATE_CUSTOM_STAMP_CELL,
      label: 'Create custom stamp…',
      icon: lucidePlus,
      command: true,
    };
    return {
      cells: [...cells, create],
      sections: [
        ...sections.map(({ category, stamps: inIt }) => ({
          label: category,
          count: inIt.length,
        })),
        { label: '', count: 1 },
      ],
    };
  }, [enabled, sections, urls, cellOf]);

  /** Places a custom stamp where a press lands: its picture sent for the document first, then the mark. */
  const place = useCallback(
    (
      ready: Ready,
      stamp: CustomStampRecord,
      where: { index: number; at: PagePoint; box: Box },
      by: { author: string; authorKey: string | null },
      onProblem: (problem: string | null) => void,
    ) => {
      const page = ready.pages[where.index];
      if (!home || !page || sending.current) return;
      sending.current = true;
      const held = (async () => {
        await home.send(stamp.picture.key, await customStampPicture(home.ownerId, stamp));
      })();
      held
        .then(() => {
          const made: StampMade = ready.undo.step({ page: page.name }, () =>
            addCustomStamp(
              ready.binding.doc,
              {
                page: page.name,
                stored: { blob: ready.storedFile, pages: ready.pages.length },
                box: where.box,
              },
              stamp,
              where.at,
              { ...by, now: Date.now(), id: crypto.randomUUID() },
            ),
          );
          if (made.ok) {
            debugLog('[pdf] custom-stamp-placed held=true');
            track('Pdf', 'Added', 'Stamp.Custom');
            onProblem(null);
          } else if (made.reason === 'pdf_too_many_marks') {
            debugLog('[pdf] limit-refused name=pdf_too_many_marks');
            onProblem(TOO_MANY_MARKS_COPY);
          } else debugLog(`[pdf] mark-refused name=${made.reason}`);
        })
        .catch((error: unknown) => {
          debugLog('[pdf] custom-stamp-placed held=false', String(error));
          onProblem(CUSTOM_STAMP_COPY.not_placed);
        })
        .finally(() => {
          sending.current = false;
        });
    },
    [home],
  );

  const dialog = useMemo<CustomStampDialogProps>(
    () => ({
      open: creating && enabled,
      ownerId,
      categories: sections.map((section) => section.category),
      onClose: () => setCreating(false),
      onMade: (stamp) => {
        setCreating(false);
        take(stamp.id);
      },
    }),
    [creating, enabled, ownerId, sections, take],
  );

  return { enabled, stamps, grid, openDialog, place, dialog };
}
