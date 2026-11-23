'use client';

// A PDF document's left side (docs/specs/035-pdf-documents/reading-surface.md "The left panel"): the rail of left
// panels and the one panel open, in the shell's frame, its body the panel's own.
import type { LinkTarget, PageInfo, PdfEngine } from '@livedoc/pdf-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import { OfficePanelRail } from '@/components/office/OfficePanelRail';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import type { PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { OUTLINE_PANEL, PDF_RAIL, THUMBNAILS_PANEL } from '@/lib/pdf-document/pdf-panels';
import { PdfOutlinePanel } from './PdfOutlinePanel';
import { PdfThumbnails } from './PdfThumbnails';

export function PdfLeftPanel({
  panels,
  tabId,
  pages,
  page,
  engine,
  drawer,
  marks,
  onGoTo,
  onFollow,
}: {
  panels: OfficePanelsState;
  tabId: string;
  pages: readonly PageInfo[];
  /** The page in view, by its index. */
  page: number;
  engine: Pick<PdfEngine, 'outline'>;
  drawer: PdfPageDrawer;
  marks: PdfMarksStore;
  onGoTo: (index: number) => void;
  /** A bookmark pressed: where it leads. */
  onFollow: (target: LinkTarget | null) => void;
}) {
  const open = PDF_RAIL.find(({ spec }) => spec.id === panels.open.left)?.spec ?? null;
  return (
    <>
      <OfficePanelRail panels={PDF_RAIL} actions={panels.actions} />
      {open ? (
        <OfficePanel
          spec={open}
          onClose={() => panels.close('left')}
          focusNonce={panels.focusNonce}
        >
          {open.id === THUMBNAILS_PANEL.id ? (
            <PdfThumbnails
              tabId={tabId}
              pages={pages}
              page={page}
              onGoTo={onGoTo}
              drawer={drawer}
              marks={marks}
            />
          ) : null}
          {open.id === OUTLINE_PANEL.id ? (
            <PdfOutlinePanel engine={engine} pages={pages} page={page} onFollow={onFollow} />
          ) : null}
        </OfficePanel>
      ) : null}
    </>
  );
}
