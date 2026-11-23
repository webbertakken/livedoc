'use client';

// A PDF document's left side (docs/specs/035-pdf-documents/reading-surface.md "The left panel"): the rail of left
// panels and the one panel open, in the shell's frame, its body the panel's own.
import {
  PDF_MAX_LAYERS,
  type LinkTarget,
  type PageInfo,
  type PdfEngine,
} from '@livedoc/pdf-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import { OfficePanelRail } from '@/components/office/OfficePanelRail';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import type { PdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import {
  EMBEDDED_FILES_PANEL,
  LAYERS_PANEL,
  OUTLINE_PANEL,
  PDF_RAIL,
  THUMBNAILS_PANEL,
} from '@/lib/pdf-document/pdf-panels';
import { PdfEmbeddedFilesPanel } from './PdfEmbeddedFilesPanel';
import { PdfLayersPanel } from './PdfLayersPanel';
import type { PdfLayerView } from '@/lib/pdf-document/usePdfLayerView';
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
  onOpenPdf,
  layerView,
}: {
  panels: OfficePanelsState;
  tabId: string;
  pages: readonly PageInfo[];
  /** The page in view, by its index. */
  page: number;
  engine: Pick<PdfEngine, 'outline' | 'embeddedFiles' | 'embeddedFile' | 'layers'>;
  /** This person's layers (reading-surface.md "Layers"). */
  layerView: Pick<PdfLayerView, 'hidden' | 'setLayer'>;
  drawer: PdfPageDrawer;
  marks: PdfMarksStore;
  onGoTo: (index: number) => void;
  /** A bookmark pressed: where it leads. */
  onFollow: (target: LinkTarget | null) => void;
  /** An embedded PDF opened as a new PDF document; answers what to say where it could not be. */
  onOpenPdf: (file: { name: string; bytes: Uint8Array<ArrayBuffer> }) => Promise<string | null>;
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
          {open.id === EMBEDDED_FILES_PANEL.id ? (
            <PdfEmbeddedFilesPanel engine={engine} onOpenPdf={onOpenPdf} />
          ) : null}
          {open.id === LAYERS_PANEL.id ? (
            <PdfLayersPanel
              engine={engine}
              hidden={layerView.hidden}
              onSet={layerView.setLayer}
              most={PDF_MAX_LAYERS}
            />
          ) : null}
        </OfficePanel>
      ) : null}
    </>
  );
}
