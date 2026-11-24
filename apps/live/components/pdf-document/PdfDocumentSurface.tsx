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
import type { PageInfo } from '@livedoc/pdf-documents';
import type { OfficeChrome } from '@/components/office/office-chrome';
import { OfficePanelLayout } from '@/components/office/OfficePanel';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { PdfDocumentScope } from '@/lib/api/pdf-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { levelInMode } from '@/lib/office/office-mode';
import { useOfficeMode } from '@/lib/office/useOfficeMode';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import { openEmbeddedPdf } from '@/lib/pdf-document/open-embedded-pdf';
import { UNTITLED_PDF } from '@/lib/pdf-document/open-pdf-file';
import { sendBlob } from '@/lib/blob-store/send-blob';
import { watchPdfBudget, type PdfStoredAsking } from '@/lib/pdf-document/pdf-budget-replacement';
import { PdfStoredFiles } from '@/lib/pdf-document/pdf-document-bus';
import { startPdfEngineWorker } from '@/lib/pdf-document/pdf-engine-client';
import { pdfReadsOf, type PdfHome } from '@/lib/pdf-document/pdf-home';
import type { BindPdfLiveChanges } from '@/lib/pdf-document/pdf-live-binding';
import { pdfLocalBinding } from '@/lib/pdf-document/pdf-local-binding';
import { marksOnPage, pdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import { droppedChangeCopy, lostChangesCopy } from '@/lib/pdf-document/pdf-surface-copy';
import { usePdfDownload } from '@/lib/pdf-document/usePdfDownload';
import { usePdfDarkPages } from '@/lib/pdf-document/usePdfDarkPages';
import { usePdfMarkSelection } from '@/lib/pdf-document/usePdfMarkSelection';
import { usePdfMarkTools } from '@/lib/pdf-document/usePdfMarkTools';
import { usePdfFullScreen } from '@/lib/pdf-document/usePdfFullScreen';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import { usePdfReadMode } from '@/lib/pdf-document/usePdfReadMode';
import { usePdfPrint, type PdfPrintSource } from '@/lib/pdf-document/usePdfPrint';
import { pdfPresencePeersOf, setLocalPdfPresence } from '@/lib/pdf-document/pdf-presence-store';
import { DOWNLOAD_PDF, GO_TO_PAGE, PDF_MENUS, REDO, UNDO } from '@/lib/pdf-document/pdf-menus';
import { pdfLimitedLevel } from '@/lib/pdf-document/pdf-limits';
import { PDF_MODES } from '@/lib/pdf-document/pdf-modes';
import { PDF_PANELS, THUMBNAILS_PANEL } from '@/lib/pdf-document/pdf-panels';
import { pdfRoomBinding, type PdfFrame } from '@/lib/pdf-document/pdf-room-binding';
import { OPEN_LEFT_PANEL, PDF_SHORTCUTS } from '@/lib/pdf-document/pdf-shortcuts';
import { pdfPillTitle } from '@/lib/pdf-document/pdf-pill';
import { pdfToolbar } from '@/lib/pdf-document/pdf-toolbar';
import { pdfViewActions } from '@/lib/pdf-document/pdf-view-actions';
import { usePdfPagesInput } from '@/lib/pdf-document/usePdfPagesInput';
import { usePdfColumnZoom } from '@/lib/pdf-document/usePdfColumnZoom';
import { usePdfLayerView } from '@/lib/pdf-document/usePdfLayerView';
import { usePdfLinks } from '@/lib/pdf-document/usePdfLinks';
import { usePdfView } from '@/lib/pdf-document/usePdfView';
import { usePdfViewHistory } from '@/lib/pdf-document/usePdfViewHistory';
import { usePdfReadingText } from '@/lib/pdf-document/usePdfReadingText';
import type { PdfUndoState } from '@/lib/pdf-document/pdf-undo';
import { usePdfThumbnail } from '@/lib/pdf-document/usePdfThumbnail';
import { usePdfDocument, type PdfDocumentDeps } from '@/lib/pdf-document/usePdfDocument';
import { usePdfZoomablePage } from '@/lib/pdf-document/usePdfZoomablePage';
import { track } from '@/lib/telemetry';
import { PdfFileNotices } from './PdfFileNotices';
import { PdfOpenNotices } from './PdfOpenNotices';
import { PdfOpeningPage } from './PdfOpeningPage';
import { PdfViewerPageBar } from './PdfPageBar';
import { PdfPages } from './PdfPages';
import { PdfSelectionBar } from './PdfSelectionBar';
import { PdfLeftPanel } from './PdfLeftPanel';
import { PdfLinkDialog } from './PdfLinkDialog';
import { PdfPrintDialog } from './PdfPrintDialog';
import { PdfFindBar } from './PdfFindBar';
import { PdfFindResults } from './PdfFindResults';

const NO_STEPS: PdfUndoState = { canUndo: false, canRedo: false };
const NO_PAGES: readonly PageInfo[] = [];
const neverChanges = () => () => {};

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
  usePdfZoomablePage();
  const open = usePdfDocument(scope, bind, attempt, deps);
  // A file that forbids changes is drawn for Viewing until its permissions password is given (opening.md).
  const drawnLevel = pdfLimitedLevel(level, open.phase === 'ready' ? open.permissions : null);
  const {
    mode,
    choice,
    actions: modeActions,
  } = useOfficeMode(drawnLevel, PDF_MODES, 'PdfDocumentMode');
  const [problem, setProblem] = useState<string | null>(null);
  const ready = open.phase === 'ready' ? open : null;
  // Marks are Reviewing's: in Viewing a tool that marks is neither offered nor in hand (editing-modes.md).
  const marking = canReview && mode !== 'viewing' && ready !== null;
  const marks = useMemo(() => (ready ? pdfMarksStore(ready.binding.doc) : null), [ready]);
  // "Dark pages": this person's look; "Layers": theirs too, and the drawer their pages are drawn with.
  const darkPages = usePdfDarkPages({ ownerId: scope.ownerId, onProblem: setProblem });
  const layerView = usePdfLayerView(ready?.engine ?? null, ready?.drawer ?? null, darkPages.look);

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
  // "Previous view", "Next view": every jump keeps where the view was.
  const history = usePdfViewHistory(viewer);
  const { jump } = history;
  const viewChrome = useMemo(() => pdfViewActions({ ...viewer, goToPage: jump }), [viewer, jump]);
  const { showPage, goToPage, element: pagesElement } = viewer;
  const focusPagesElement = useCallback(() => pagesElement?.focus(), [pagesElement]);
  // "The left panel": the shell's, one open at a time, remembered for every PDF; closing it gives the pages the keys.
  const panels = useOfficePanels({
    kind: 'PdfDocument',
    panels: PDF_PANELS,
    onFocusDocument: () => pagesElement?.focus(),
  });
  const links = usePdfLinks({
    pages: pages ?? NO_PAGES,
    turns: viewer.view.turns,
    engine: ready?.engine ?? null,
    goTo: jump,
  });
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

  const storedFile = 'storedFile' in open ? open.storedFile : null;
  // The stored file's bytes, read again from where they are held; Download and Print are offered only with one.
  const readStored = useMemo(
    () =>
      storedFile
        ? () => deps.readBlob({ ownerId, documentId, tabId, shareCode }, storedFile)
        : null,
    [deps, ownerId, documentId, tabId, shareCode, storedFile],
  );
  const download = usePdfDownload({
    engine: ready?.engine ?? null,
    doc: ready?.binding.doc ?? null,
    documentName,
    readStored,
    onProblem: setProblem,
  });

  const printSource = useMemo<PdfPrintSource | null>(
    () =>
      ready && marks && readStored
        ? {
            engine: ready.engine,
            doc: ready.binding.doc,
            pages: ready.pages,
            permissions: ready.permissions,
            marksOn: (page) => marksOnPage(marks.get(), page.name),
            readStored,
          }
        : null,
    [ready, marks, readStored],
  );
  const printing = usePdfPrint({
    source: printSource,
    documentName,
    onProblem: setProblem,
  });

  // "Selecting text", "Copy", "Find", "The context menu": the person's own reading of the pages' text.
  const reading = usePdfReadingText({
    engine: ready?.engine ?? null,
    pages,
    page: viewer.page,
    turns: viewer.view.turns,
    pagesElement,
    mayCopy: ready?.permissions.copy ?? false,
    jump,
    follow: links.follow,
    step: history.step,
    onProblem: setProblem,
  });
  const { selection: textSelection, find } = reading;
  // "Making a mark": the tool in hand, and the text marks it makes.
  const tools = usePdfMarkTools({
    ready,
    marking,
    author,
    selected: textSelection.selected,
    clearSelection: textSelection.clear,
    focusPages: focusPagesElement,
    onProblem: setProblem,
  });
  // "Changing a mark": the marks this person selected, moved and deleted.
  const markSelection = usePdfMarkSelection({
    ready,
    marks,
    marking,
    textSelected: textSelection.selected,
    clearText: textSelection.clear,
    focusPages: focusPagesElement,
  });
  const zoomToColumn = usePdfColumnZoom(viewer, textSelection.texts);
  // "Read mode", "Full screen": one person's room for the pages.
  const readMode = usePdfReadMode();
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const fullScreen = usePdfFullScreen({
    element: ready ? column : null,
    view: viewer.view,
    setWholeView: viewer.setWholeView,
  });

  const actions: OfficeActions = useMemo(
    () => ({
      ...modeActions,
      ...(storedFile ? { [DOWNLOAD_PDF]: { run: () => void download() } } : {}),
      ...(ready
        ? {
            ...viewChrome.actions,
            // In Read mode the panels are hidden, and their keys do nothing.
            ...(readMode.on ? {} : { ...panels.actions, [OPEN_LEFT_PANEL]: { run: revealLeft } }),
            ...history.actions,
            ...reading.actions,
            ...printing.actions,
            ...readMode.actions,
            ...darkPages.actions,
            ...fullScreen.actions,
            ...tools.actions,
            ...markSelection.actions,
            [GO_TO_PAGE]: { run: focusPageField },
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
      history.actions,
      reading.actions,
      printing.actions,
      readMode.on,
      readMode.actions,
      fullScreen.actions,
      darkPages.actions,
      revealLeft,
      focusPageField,
      marking,
      undo,
      steps,
      tools.actions,
      markSelection.actions,
    ],
  );

  // The tools' own keys, heard anywhere on the surface but a text field (keyboard-shortcuts.md "Tools").
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (printing.onKey(event)) return;
    if (typesText(event.target)) return;
    if (readMode.onKey(event)) return;
    if (reading.onKey(event)) return;
    tools.onKey(event);
  };

  const state = open.phase === 'refused' ? `refused:${open.refusal}` : open.phase;
  return (
    <div
      ref={root}
      className="office-shell flex min-h-0 flex-1 flex-col bg-(--office-ground)"
      data-pdf-surface={state}
      data-pdf-tool={tools.inHand}
      data-pdf-look={darkPages.look}
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
        level={levelInMode(PDF_MODES, drawnLevel, mode)}
        actions={actions}
        shortcuts={PDF_SHORTCUTS}
        keyScope={root}
        chrome={chrome}
        tabId={scope.tabId}
        onFollow={goToPerson}
        saveStatus={ready?.binding.saveStatus ?? null}
        toolbar={pdfToolbar(mode)}
        choices={ready ? { ...viewChrome.choices, ...tools.choices } : null}
        colours={ready ? tools.colours : null}
        mode={open.phase === 'ready' ? choice : null}
        contextMenu={ready ? reading.contextMenu : null}
        bare={readMode.on ? { leave: 'Leave read mode', onLeave: readMode.leave } : null}
      />
      {ready ? (
        <PdfFileNotices
          permissions={ready.permissions}
          liftLimits={ready.liftLimits}
          repaired={ready.repaired}
          canChange={marking}
        />
      ) : null}
      {open.phase === 'opening' ? <PdfOpeningPage /> : null}
      {ready && marks ? (
        <PdfLookContext.Provider value={darkPages.look}>
          <OfficePanelLayout
            left={
              readMode.on ? null : (
                <PdfLeftPanel
                  panels={panels}
                  tabId={tabId}
                  pages={ready.pages}
                  page={viewer.page}
                  engine={ready.engine}
                  drawer={layerView.drawer ?? ready.drawer}
                  marks={marks}
                  onGoTo={jump}
                  onFollow={links.follow}
                  onOpenPdf={(file) => openEmbeddedPdf(ownerId, home, file)}
                  layerView={layerView}
                />
              )
            }
            right={
              !readMode.on && find.open && find.listOpen ? (
                <PdfFindResults find={find} pages={ready.pages} focusNonce={0} />
              ) : null
            }
          >
            <div
              ref={setColumn}
              className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-(--office-ground)"
            >
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
                drawer={layerView.drawer ?? ready.drawer}
                marks={marks}
                tool={tools.inHand}
                onMark={tools.make}
                ink={tools.ink}
                shaping={tools.shaping}
                stamping={tools.stamping}
                typing={tools.typing}
                selection={textSelection.selected}
                chosen={markSelection.chosen}
                choosing={markSelection.choosing}
                onText={textSelection.gesture}
                texts={textSelection.texts}
                onFollow={links.follow}
                found={find.tints}
                onDoubleTap={zoomToColumn}
              />
              <PdfSelectionBar
                selected={textSelection.selected}
                actions={actions}
                pages={pagesElement}
                view={viewer.viewStore}
              />
              {find.open ? <PdfFindBar find={find} onClosed={() => pagesElement?.focus()} /> : null}
              {fullScreen.on ? null : (
                <PdfViewerPageBar
                  viewer={viewer}
                  labels={labels}
                  onGoTo={jump}
                  pageField={pageField}
                />
              )}
            </div>
          </OfficePanelLayout>
        </PdfLookContext.Provider>
      ) : null}
      <PdfOpenNotices
        open={open}
        onTryAgain={() => setAttempt((n) => n + 1)}
        onDownload={() => void download()}
      />
      <PdfLinkDialog asked={links.asked} onClose={links.close} />
      <PdfPrintDialog {...printing.dialog} count={pages?.length ?? 0} current={viewer.page} />
    </div>
  );
}
