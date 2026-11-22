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
  type KeyboardEvent,
} from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextSelection } from '@livedoc/pdf-documents';
import type { OfficeChrome } from '@/components/office/office-chrome';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import { apiReadBlob } from '@/lib/api/files';
import type { PdfDocumentScope } from '@/lib/api/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { levelInMode } from '@/lib/office/office-mode';
import type { OfficeZoomValue } from '@/lib/office/office-zoom';
import { useOfficeMode } from '@/lib/office/useOfficeMode';
import { BAKE_FAILED_COPY, bakeForDownload } from '@/lib/pdf-document/download-pdf';
import { UNTITLED_PDF } from '@/lib/pdf-document/open-pdf-file';
import { addHighlight } from '@/lib/pdf-document/pdf-highlight';
import type { PdfDocumentRefusal } from '@/lib/pdf-document/pdf-document-bus';
import type { BindPdfLiveChanges } from '@/lib/pdf-document/pdf-live-binding';
import { pdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import { DOWNLOAD_PDF, PDF_MENUS, TOOL_HIGHLIGHT, TOOL_SELECT } from '@/lib/pdf-document/pdf-menus';
import { PDF_MODES } from '@/lib/pdf-document/pdf-modes';
import { pdfRoomBinding, type PdfFrame } from '@/lib/pdf-document/pdf-room-binding';
import {
  PDF_REFUSAL_COPY,
  pdfRefusalDownloads,
  pdfRefusalRetries,
} from '@/lib/pdf-document/pdf-refusals';
import { PDF_SHORTCUTS, PDF_TOOL_KEYS } from '@/lib/pdf-document/pdf-shortcuts';
import { PDF_TOOLBAR } from '@/lib/pdf-document/pdf-toolbar';
import { usePdfDocument } from '@/lib/pdf-document/usePdfDocument';
import { track } from '@/lib/telemetry';
import { PdfNotice, PdfNoticeButton } from './PdfNotice';
import type { PdfPageTool } from './PdfPage';
import { PdfPages } from './PdfPages';

/** "This PDF holds the most marks LiveDoc keeps for one file (20,000)." (marks.md "Errors"). */
const TOO_MANY_MARKS_COPY = 'This PDF holds the most marks LiveDoc keeps for one file (20,000).';
/** Said once a change the room refused for a limit has been dropped (live-editing-and-storage.md "Limits"). */
const CHANGES_DO_NOT_FIT_COPY = 'This PDF has more unsaved changes than fit.';
/** Said once a change refused for the level has been dropped (editing-modes.md "Errors"). */
const VIEW_ONLY_COPY = 'You can view this PDF, but not change it.';
const REVIEW_ONLY_COPY = 'You can review this PDF, but not edit its pages.';

/** What a person is told once a change the room refused has been dropped. */
export const droppedChangeCopy = (refusal: PdfDocumentRefusal, level: AccessLevel): string => {
  if (refusal !== 'level_too_low') return CHANGES_DO_NOT_FIT_COPY;
  return level === 'view' ? VIEW_ONLY_COPY : REVIEW_ONLY_COPY;
};

const megabytes = (bytes: number): string =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1_000))} kB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;

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
  sequence,
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
  // One frame to the document's room; true once the room has stored it.
  sequence: (op: PdfFrame) => Promise<boolean>;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { ownerId, documentId, tabId, shareCode } = scope;
  // Read as the binding sends: a level that changes, or a room that reconnects, never binds again.
  const live = useRef({ canReview, sequence, level });
  useLayoutEffect(() => {
    live.current = { canReview, sequence, level };
  });
  const bind = useCallback<BindPdfLiveChanges>(
    (read) =>
      pdfRoomBinding({
        scope: { ownerId, documentId, tabId, shareCode },
        get canChange() {
          return live.current.canReview;
        },
        sequence: (op) => live.current.sequence(op),
      })(read),
    [ownerId, documentId, tabId, shareCode],
  );
  const open = usePdfDocument(scope, bind, attempt);
  const { mode, choice, actions: modeActions } = useOfficeMode(level, PDF_MODES, 'PdfDocumentMode');
  const [tool, setTool] = useState<PdfPageTool>('select');
  const [zoom, setZoom] = useState<OfficeZoomValue>('fit');
  const [problem, setProblem] = useState<string | null>(null);
  const ready = open.phase === 'ready' ? open : null;
  // Marks are Reviewing's: in Viewing a tool that marks is neither offered nor in hand (editing-modes.md).
  const marking = canReview && mode !== 'viewing' && ready !== null;
  const inHand: PdfPageTool = marking ? tool : 'select';
  const marks = useMemo(() => (ready ? pdfMarksStore(ready.binding.doc) : null), [ready]);

  const onDropped = ready?.onDropped ?? null;
  useEffect(
    () => onDropped?.((refusal) => setProblem(droppedChangeCopy(refusal, live.current.level))),
    [onDropped],
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
        readStored: () => apiReadBlob(where, storedFile),
      });
      if (!baked.ok) return setProblem(BAKE_FAILED_COPY);
      downloadBlob(new Blob([baked.bytes], { type: 'application/pdf' }), baked.fileName);
      track('Pdf', 'Exported', 'Pdf');
    } catch (error) {
      debugLog('[pdf] download failed', String(error));
      setProblem(BAKE_FAILED_COPY);
    }
  }, [ready, storedFile, documentName, ownerId, documentId, tabId, shareCode]);

  const pickTool = useCallback((next: PdfPageTool) => {
    setTool(next);
    if (next === 'highlight') track('Pdf', 'Selected', 'Tool.Highlight');
    else track('Pdf', 'Selected', 'Tool.Select');
  }, []);

  const onHighlight = useCallback(
    (index: number, selection: TextSelection) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const made = addHighlight(
        ready.binding.doc,
        { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
        selection,
        { author, now: Date.now(), id: crypto.randomUUID() },
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
        ? { [TOOL_SELECT]: { run: () => pickTool('select'), checked: inHand === 'select' } }
        : {}),
      ...(marking
        ? {
            [TOOL_HIGHLIGHT]: { run: () => pickTool('highlight'), checked: inHand === 'highlight' },
          }
        : {}),
    }),
    [modeActions, storedFile, download, ready, marking, inHand, pickTool],
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
        formatTitle={
          ready
            ? `PDF, ${ready.pages.length} ${ready.pages.length === 1 ? 'page' : 'pages'}, ${megabytes(ready.bytes)}`
            : 'PDF document'
        }
        problem={problem}
        catalogue={PDF_MENUS}
        level={levelInMode(PDF_MODES, level, mode)}
        actions={actions}
        shortcuts={PDF_SHORTCUTS}
        keyScope={root}
        chrome={chrome}
        tabId={scope.tabId}
        saveStatus={ready?.binding.saveStatus ?? null}
        toolbar={PDF_TOOLBAR}
        zoom={ready ? { value: zoom, onChange: setZoom } : null}
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
        <PdfPages
          scroller={scroller}
          pages={ready.pages}
          zoom={zoom}
          engine={ready.engine}
          drawer={ready.drawer}
          marks={marks}
          tool={inHand}
          onHighlight={onHighlight}
        />
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
