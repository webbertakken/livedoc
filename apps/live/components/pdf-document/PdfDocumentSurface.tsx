'use client';

// A PDF document's surface (docs/specs/035-pdf-documents/reading-surface.md; opening.md; marks.md): the office
// shell's title row, menus and toolbar filled for a PDF, and under them the pages, or what is said when there are
// none to show. The pages are the engine's pictures, drawn in a worker; the chrome is the shell's tokens in both
// schemes, and a page is as its file says.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { PageInfo, TextSelection } from '@livedoc/pdf-documents';
import type { OfficeChrome } from '@/components/office/office-chrome';
import { OfficePanelLayout } from '@/components/office/OfficePanel';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { PdfDocumentScope } from '@/lib/api/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { levelInMode } from '@/lib/office/office-mode';
import { useOfficeMode } from '@/lib/office/useOfficeMode';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import { BAKE_FAILED_COPY, bakeForDownload } from '@/lib/pdf-document/download-pdf';
import { openEmbeddedPdf } from '@/lib/pdf-document/open-embedded-pdf';
import { UNTITLED_PDF } from '@/lib/pdf-document/open-pdf-file';
import { addHighlight } from '@/lib/pdf-document/pdf-highlight';
import { sendBlob } from '@/lib/blob-store/send-blob';
import { watchPdfBudget, type PdfStoredAsking } from '@/lib/pdf-document/pdf-budget-replacement';
import { PdfStoredFiles, type PdfDocumentRefusal } from '@/lib/pdf-document/pdf-document-bus';
import { startPdfEngineWorker } from '@/lib/pdf-document/pdf-engine-client';
import { pdfReadsOf, type PdfHome } from '@/lib/pdf-document/pdf-home';
import type { BindPdfLiveChanges } from '@/lib/pdf-document/pdf-live-binding';
import { pdfLocalBinding } from '@/lib/pdf-document/pdf-local-binding';
import { pdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import { pdfPresencePeersOf, setLocalPdfPresence } from '@/lib/pdf-document/pdf-presence-store';
import {
  DOWNLOAD_PDF,
  GO_TO_PAGE,
  PDF_MENUS,
  REDO,
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  UNDO,
} from '@/lib/pdf-document/pdf-menus';
import { PDF_MODES } from '@/lib/pdf-document/pdf-modes';
import { PDF_PANELS, THUMBNAILS_PANEL } from '@/lib/pdf-document/pdf-panels';
import { pdfRoomBinding, type PdfFrame } from '@/lib/pdf-document/pdf-room-binding';
import {
  PDF_REFUSAL_COPY,
  pdfRefusalDownloads,
  pdfRefusalRetries,
} from '@/lib/pdf-document/pdf-refusals';
import { OPEN_LEFT_PANEL, PDF_SHORTCUTS, PDF_TOOL_KEYS } from '@/lib/pdf-document/pdf-shortcuts';
import { pdfPillTitle } from '@/lib/pdf-document/pdf-pill';
import { pdfToolbar } from '@/lib/pdf-document/pdf-toolbar';
import { pdfViewActions } from '@/lib/pdf-document/pdf-view-actions';
import { usePdfPagesInput } from '@/lib/pdf-document/usePdfPagesInput';
import { usePdfLinks } from '@/lib/pdf-document/usePdfLinks';
import { usePdfView } from '@/lib/pdf-document/usePdfView';
import type { PdfUndoState } from '@/lib/pdf-document/pdf-undo';
import { usePdfThumbnail } from '@/lib/pdf-document/usePdfThumbnail';
import { usePdfDocument, type PdfDocumentDeps } from '@/lib/pdf-document/usePdfDocument';
import { track } from '@/lib/telemetry';
import { PdfNotice, PdfNoticeButton } from './PdfNotice';
import { PdfPageBar } from './PdfPageBar';
import type { PdfPageTool } from './PdfPage';
import { PdfPages } from './PdfPages';
import { PdfLeftPanel } from './PdfLeftPanel';
import { PdfLinkDialog } from './PdfLinkDialog';

/** "This PDF holds the most marks LiveDoc keeps for one file (20,000)." (marks.md "Errors"). */
const TOO_MANY_MARKS_COPY = 'This PDF holds the most marks LiveDoc keeps for one file (20,000).';
/** Said once a change the room refused for a limit has been dropped (live-editing-and-storage.md "Limits"). */
const CHANGES_DO_NOT_FIT_COPY = 'This PDF has more unsaved changes than fit.';
/** Said once a change refused for the level has been dropped (editing-modes.md "Errors"). */
const VIEW_ONLY_COPY = 'You can view this PDF, but not change it.';
const REVIEW_ONLY_COPY = 'You can review this PDF, but not edit its pages.';

/** What a person is told of changes that could not be placed on a replaced stored file
 *  (live-editing-and-storage.md "A change carried across a replacement"). */
export const lostChangesCopy = (count: number): string =>
  count === 1
    ? '1 change couldn’t be placed on the new file.'
    : `${count} changes couldn’t be placed on the new file.`;

const NO_STEPS: PdfUndoState = { canUndo: false, canRedo: false };
const NO_PAGES: readonly PageInfo[] = [];
const neverChanges = () => () => {};

/** What a person is told once a change the room refused has been dropped. */
export const droppedChangeCopy = (refusal: PdfDocumentRefusal, level: AccessLevel): string => {
  if (refusal !== 'level_too_low') return CHANGES_DO_NOT_FIT_COPY;
  return level === 'view' ? VIEW_ONLY_COPY : REVIEW_ONLY_COPY;
};

const typesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function PdfDocumentSurface({
  scope,
  documentName,
  level,
  canReview,
  author,
  chrome,
  present,
  sequence,
  home = 'room',
}: {
  scope: PdfDocumentScope;
  documentName: string;
  // The level the surface is drawn for: no more than what the session may change on a PDF.
  level: AccessLevel;
  // Whether this session may change what Reviewing changes (`can.pdfReviews`).
  canReview: boolean;
  // The display name a mark made here carries.
  author: string;
  // The document's own parts in the title row; null where another pane shows them.
  chrome: OfficeChrome | null;
  // Whether this is the tab the person is on: the other pane of a split says nothing of where they are.
  present: boolean;
  // One frame, or one replacement of the stored file, to the document's room; true once the room has stored it.
  sequence: (op: PdfFrame | PdfStoredAsking) => Promise<boolean>;
  // Where the PDF is: its document's room, or This Browser ("Offline and This Browser"). A surface is keyed by it.
  home?: PdfHome;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { ownerId, documentId, tabId, shareCode } = scope;
  // Read as the binding sends: a level that changes, or a room that reconnects, never binds again.
  const live = useRef({ canReview, sequence, level });
  useLayoutEffect(() => {
    live.current = { canReview, sequence, level };
  });
  const bind = useCallback<BindPdfLiveChanges>(
    (read) =>
      home === 'this-browser'
        ? pdfLocalBinding({ documentId, tabId })(read)
        : pdfRoomBinding({
            scope: { ownerId, documentId, tabId, shareCode },
            get canChange() {
              return live.current.canReview;
            },
            sequence: (op) => live.current.sequence(op),
          })(read),
    [home, ownerId, documentId, tabId, shareCode],
  );
  const deps = useMemo<PdfDocumentDeps>(
    () => ({ ...pdfReadsOf(home), startEngine: startPdfEngineWorker }),
    [home],
  );
  const open = usePdfDocument(scope, bind, attempt, deps);
  const { mode, choice, actions: modeActions } = useOfficeMode(level, PDF_MODES, 'PdfDocumentMode');
  const [tool, setTool] = useState<PdfPageTool>('select');
  const [problem, setProblem] = useState<string | null>(null);
  const ready = open.phase === 'ready' ? open : null;
  // Marks are Reviewing's: in Viewing a tool that marks is neither offered nor in hand (editing-modes.md).
  const marking = canReview && mode !== 'viewing' && ready !== null;
  const inHand: PdfPageTool = marking ? tool : 'select';
  const marks = useMemo(() => (ready ? pdfMarksStore(ready.binding.doc) : null), [ready]);

  // "Replacing the stored file": an Editor's idle surface replaces it for the budget. The room's alone: in This
  // Browser the stored file is not replaced.
  useEffect(() => {
    if (!ready || home !== 'room') return undefined;
    const document = { documentId, shareCode };
    const watch = watchPdfBudget({
      tabId,
      doc: ready.binding.doc,
      storedFile: ready.storedFile,
      pages: ready.pages.length,
      engine: ready.engine,
      canReplace: () => live.current.level === 'edit',
      isSaved: ready.binding.isSaved,
      store: (key, bytes) => sendBlob(ownerId, key, bytes, { document }),
      ask: (asking) => live.current.sequence(asking),
      onRefused: (listener) => PdfStoredFiles.onRefused(tabId, listener),
    });
    return watch.stop;
  }, [ready, home, ownerId, documentId, tabId, shareCode]);

  usePdfThumbnail(ready, marks, scope, home, level);

  const onDropped = ready?.onDropped ?? null;
  useEffect(
    () => onDropped?.((refusal) => setProblem(droppedChangeCopy(refusal, live.current.level))),
    [onDropped],
  );

  const onLost = ready?.onLost ?? null;
  useEffect(() => onLost?.((count) => setProblem(lostChangesCopy(count))), [onLost]);

  // "Undo": the person's own steps on these live changes; a step returning shows the page it was made on.
  const undo = ready?.undo ?? null;
  const steps = useSyncExternalStore(
    undo?.subscribe ?? neverChanges,
    () => undo?.get() ?? NO_STEPS,
    () => NO_STEPS,
  );
  const pages = ready?.pages ?? null;
  // "The pages", "The page bar": the person's own view of the pages, and what moves it.
  const viewer = usePdfView(pages ?? NO_PAGES);
  const pagesInput = usePdfPagesInput(viewer);
  const pageField = useRef<HTMLInputElement | null>(null);
  const labels = useMemo(() => (pages ?? NO_PAGES).map((page) => page.label), [pages]);
  // Go to > Page… puts the caret in the page bar's page field.
  const focusPageField = useCallback(() => pageField.current?.focus(), []);
  const viewChrome = useMemo(() => pdfViewActions(viewer), [viewer]);
  const { showPage, goToPage, element: pagesElement } = viewer;
  // "The left panel": the shell's, one open at a time, remembered for every PDF; closing it gives the pages the keys.
  const panels = useOfficePanels({
    kind: 'PdfDocument',
    panels: PDF_PANELS,
    onFocusDocument: () => pagesElement?.focus(),
  });
  const links = usePdfLinks(pages ?? NO_PAGES, goToPage);
  const { reveal } = panels;
  const leftOpen = panels.open.left;
  // ⌘⌥⇧T: focus in the left panel open, or Thumbnails opened.
  const revealLeft = useCallback(
    () => reveal(PDF_PANELS.find((panel) => panel.id === leftOpen) ?? THUMBNAILS_PANEL),
    [reveal, leftOpen],
  );
  useEffect(
    () =>
      undo?.onReturn((place) => {
        const at = (pages ?? []).findIndex((page) => page.name === place.page);
        if (at >= 0) showPage(at);
      }),
    [undo, pages, showPage],
  );

  // "Presence": the page in view and the mode, said for the tab this person is on, and taken back on leaving it.
  const inView = useRef(0);
  const publishPlace = useCallback(() => {
    if (!present || !pages) return;
    const page = pages[Math.min(inView.current, pages.length - 1)];
    if (page) setLocalPdfPresence(tabId, { page: page.name, mode, held: null });
  }, [present, pages, tabId, mode]);
  useEffect(publishPlace, [publishPlace]);
  useEffect(() => (present ? () => setLocalPdfPresence(tabId, null) : undefined), [present, tabId]);
  const inViewNow = viewer.page;
  useEffect(() => {
    inView.current = inViewNow;
    publishPlace();
  }, [inViewNow, publishPlace]);
  // A press on a person in the title row goes to the page they are on; false where their page is not in this file.
  const goToPerson = useCallback(
    (personId: string): boolean => {
      const peer = pdfPresencePeersOf(tabId).find((person) => person.id === personId);
      const at = peer ? (pages ?? []).findIndex((page) => page.name === peer.place.page) : -1;
      if (at < 0) return false;
      goToPage(at);
      track('UI', 'Used', 'PdfDocumentFollow');
      return true;
    },
    [tabId, pages, goToPage],
  );

  const storedFile = open.phase === 'ready' || open.phase === 'refused' ? open.storedFile : null;
  const download = useCallback(async () => {
    if (!storedFile) return;
    setProblem(null);
    const where = { ownerId, documentId, tabId, shareCode };
    try {
      const baked = await bakeForDownload({
        engine: ready?.engine ?? { bake: async () => ({ ok: false, refusal: 'unreadable' }) },
        doc: ready?.binding.doc ?? null,
        documentName,
        readStored: () => deps.readBlob(where, storedFile),
      });
      if (!baked.ok) return setProblem(BAKE_FAILED_COPY);
      downloadBlob(new Blob([baked.bytes], { type: 'application/pdf' }), baked.fileName);
      track('Pdf', 'Exported', 'Pdf');
    } catch (error) {
      debugLog('[pdf] download failed', String(error));
      setProblem(BAKE_FAILED_COPY);
    }
  }, [ready, storedFile, documentName, deps, ownerId, documentId, tabId, shareCode]);

  const pickTool = useCallback((next: PdfPageTool) => {
    setTool(next);
    if (next === 'highlight') track('Pdf', 'Selected', 'Tool.Highlight');
    else track('Pdf', 'Selected', 'Tool.Select');
  }, []);

  const onHighlight = useCallback(
    (index: number, selection: TextSelection) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      // One mark drawn is one step of the person's undo, made on this page.
      const made = ready.undo.step({ page: page.name }, () =>
        addHighlight(
          ready.binding.doc,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
          selection,
          { author, now: Date.now(), id: crypto.randomUUID() },
        ),
      );
      if (made.ok) {
        debugLog('[pdf] mark-added kind=highlight');
        track('Pdf', 'Added', 'Mark.Highlight');
        setProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        setProblem(TOO_MANY_MARKS_COPY);
      }
    },
    [ready, author],
  );

  const actions: OfficeActions = useMemo(
    () => ({
      ...modeActions,
      ...(storedFile ? { [DOWNLOAD_PDF]: { run: () => void download() } } : {}),
      ...(ready
        ? {
            ...viewChrome.actions,
            ...panels.actions,
            [OPEN_LEFT_PANEL]: { run: revealLeft },
            [GO_TO_PAGE]: { run: focusPageField },
            [TOOL_SELECT]: { run: () => pickTool('select'), checked: inHand === 'select' },
          }
        : {}),
      ...(marking && undo
        ? {
            [UNDO]: {
              run: () => {
                track('Pdf', 'Undone');
                undo.undo();
              },
              disabled: !steps.canUndo,
            },
            [REDO]: {
              run: () => {
                track('Pdf', 'Redone');
                undo.redo();
              },
              disabled: !steps.canRedo,
            },
            [TOOL_HIGHLIGHT]: { run: () => pickTool('highlight'), checked: inHand === 'highlight' },
          }
        : {}),
    }),
    [
      modeActions,
      storedFile,
      download,
      ready,
      viewChrome,
      panels.actions,
      revealLeft,
      focusPageField,
      marking,
      undo,
      steps,
      inHand,
      pickTool,
    ],
  );

  // The tools' own keys, heard anywhere on the surface but a text field (keyboard-shortcuts.md "Tools").
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || typesText(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === PDF_TOOL_KEYS.highlight && marking) pickTool('highlight');
    else if ((key === PDF_TOOL_KEYS.select || key === 'escape') && inHand !== 'select')
      pickTool('select');
    else return;
    event.preventDefault();
  };

  const state = open.phase === 'refused' ? `refused:${open.refusal}` : open.phase;
  return (
    <div
      ref={root}
      className="office-shell flex min-h-0 flex-1 flex-col bg-(--office-ground)"
      data-pdf-surface={state}
      data-pdf-tool={inHand}
      onKeyDown={onKeyDown}
    >
      <OfficeTitleRow
        name={documentName || UNTITLED_PDF}
        format="PDF"
        formatTitle={pdfPillTitle(
          ready && {
            version: ready.version,
            pages: ready.pages.length,
            bytes: ready.bytes,
            protected: ready.protected,
          },
        )}
        problem={problem}
        catalogue={PDF_MENUS}
        level={levelInMode(PDF_MODES, level, mode)}
        actions={actions}
        shortcuts={PDF_SHORTCUTS}
        keyScope={root}
        chrome={chrome}
        tabId={scope.tabId}
        onFollow={goToPerson}
        saveStatus={ready?.binding.saveStatus ?? null}
        toolbar={pdfToolbar(mode)}
        choices={ready ? viewChrome.choices : null}
        mode={open.phase === 'ready' ? choice : null}
      />
      {open.phase === 'opening' ? (
        // A page-shaped placeholder on the surface's ground, so nothing shifts when page one arrives.
        <div
          className="flex min-h-0 flex-1 justify-center overflow-hidden px-6 py-6"
          aria-busy="true"
        >
          <div
            role="status"
            className="aspect-[612/792] w-full max-w-[816px] bg-white shadow-sm outline outline-1 outline-(--office-line)"
          >
            <span className="sr-only">Opening this PDF…</span>
          </div>
        </div>
      ) : null}
      {ready && marks ? (
        <OfficePanelLayout
          left={
            <PdfLeftPanel
              panels={panels}
              tabId={tabId}
              pages={ready.pages}
              page={viewer.page}
              engine={ready.engine}
              drawer={ready.drawer}
              marks={marks}
              onGoTo={goToPage}
              onFollow={links.follow}
              onOpenPdf={(file) => openEmbeddedPdf(ownerId, home, file)}
            />
          }
          right={null}
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <PdfPages
              attach={viewer.attach}
              layout={viewer.layout}
              scale={viewer.scale}
              turns={viewer.view.turns}
              viewStore={viewer.viewStore}
              sized={viewer.viewport.width > 0}
              onKeyDown={pagesInput.onKeyDown}
              pages={ready.pages}
              engine={ready.engine}
              drawer={ready.drawer}
              marks={marks}
              tool={inHand}
              onHighlight={onHighlight}
            />
            <PdfPageBar
              page={viewer.page}
              labels={labels}
              atFirst={viewer.atFirst}
              atLast={viewer.atLast}
              zoom={viewer.view.zoom}
              scale={viewer.scale}
              onPrevious={() => viewer.turn(-1)}
              onNext={() => viewer.turn(1)}
              onGoTo={viewer.goToPage}
              onZoom={viewer.zoomTo}
              pageField={pageField}
            />
          </div>
        </OfficePanelLayout>
      ) : null}
      {open.phase === 'refused' ? (
        <PdfNotice sentence={PDF_REFUSAL_COPY[open.refusal]}>
          {pdfRefusalRetries(open.refusal) ? (
            <PdfNoticeButton onClick={() => setAttempt((n) => n + 1)}>Try again</PdfNoticeButton>
          ) : null}
          {open.storedFile && pdfRefusalDownloads(open.refusal) ? (
            <PdfNoticeButton onClick={() => void download()}>Download</PdfNoticeButton>
          ) : null}
        </PdfNotice>
      ) : null}
      <PdfLinkDialog asked={links.asked} onClose={links.close} />
      {open.phase === 'gone' ? (
        <PdfNotice sentence="This PDF is no longer in this document." />
      ) : null}
      {open.phase === 'failed' ? (
        <PdfNotice role="alert" sentence="This tab couldn’t load.">
          <PdfNoticeButton onClick={() => setAttempt((n) => n + 1)}>Try Again</PdfNoticeButton>
        </PdfNotice>
      ) : null}
    </div>
  );
}
