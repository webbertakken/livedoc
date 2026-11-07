'use client';

import {
  Activity,
  Suspense,
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { OpeningScreen } from '@/components/chrome/OpeningScreen';
import { loadEditorPage, loadedEditorPage } from '@/lib/editor-page-loader';
import {
  prefetchNewDocumentOpenWhenIdle,
  prepareStandbyDocument,
} from '@/app/explorer/new-document/start-new-document';
import { EditorSeedIdContext } from '@/app/document/[id]/editor-seed-context';
import { useLastBlank } from '@/lib/new-document/last-blank';
import { subscribeNewDocumentCreator } from '@/lib/new-document/new-document-creator';
import { debugLog } from '@/lib/debug-log';
import { isPendingSettled } from '@/lib/new-document/pending-documents';
import { closeInPlace, openInPlace, useInPlaceDocuments } from './in-place-editor-store';
import { documentIdFromPath, isEditorPath } from '@/lib/legacy-editor-path';

// How often an editor kept for its create checks whether it may go (D198).
export const IN_PLACE_SETTLE_POLL_MS = 250;
// The longest the standby waits for an idle moment (D205).
export const STANDBY_IDLE_TIMEOUT_MS = 2000;

const subscribeAddress = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
const browserPathname = () => window.location.pathname;
const noPathname = () => null;

// When the Explorer next has a quiet moment: what the standby waits for, so it never competes with the Explorer's own
// first work.
function whenIdle(run: () => void): () => void {
  if (
    typeof window.requestIdleCallback === 'function' &&
    typeof window.cancelIdleCallback === 'function'
  ) {
    const id = window.requestIdleCallback(run, { timeout: STANDBY_IDLE_TIMEOUT_MS });
    // The cancel is taken now, as it is: a page (or a test) that drops it later still lets the wait go.
    const cancel = window.cancelIdleCallback.bind(window);
    return () => cancel(id);
  }
  const id = window.setTimeout(run, STANDBY_IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(id);
}

// The editor in the Explorer's place (docs/specs/013-workspace/new-document-menu.md "Opening at once"): a
// document made from the New Document menu opens here, under /document/<id>, with no page
// load. While the address names it the editor shows and the Explorer is gone; once the address leaves it (Back, or
// the editor's own way to the Explorer) the Explorer is back, and the editor stays, hidden, only until its document
// is settled, so nothing done before the create landed is lost.
export function InPlaceEditor({ children }: { children: ReactNode }) {
  const { open: openId, standby: standbyId } = useInPlaceDocuments();
  // The address as the browser has it: startNewDocument moves it before it opens, Back moves it on popstate. Next's
  // pathname re-renders this on the router's own moves (the editor's way back to the Explorer).
  usePathname();
  const pathname = useSyncExternalStore(subscribeAddress, browserPathname, noPathname);
  // The document the address names, when the Explorer's layout is showing a document's address.
  const addressed = isEditorPath(pathname ?? '') ? documentIdFromPath(pathname ?? '').id : null;
  const shown = openId !== null && addressed === openId;

  // Forward to a document this page opened in place, after it went: open it here again, as any document opens.
  useEffect(() => {
    if (addressed === null || addressed === openId) return;
    let live = true;
    void loadEditorPage().then(() => {
      if (live) openInPlace(addressed);
    });
    return () => {
      live = false;
    };
  }, [addressed, openId]);

  // What opening needs comes in while the Explorer is idle.
  useEffect(() => prefetchNewDocumentOpenWhenIdle(), []);

  // The standby: the blank the face makes next, rendered ahead and hidden, so the click only
  // reveals an editor already built. Made again for the face's blank and whoever is creating, whenever either changes.
  const lastBlank = useLastBlank();
  const [creatorTick, setCreatorTick] = useState(0);
  useEffect(() => subscribeNewDocumentCreator(() => setCreatorTick((t) => t + 1)), []);
  useEffect(() => {
    if (openId !== null) return;
    return whenIdle(() => void prepareStandbyDocument(lastBlank));
  }, [openId, lastBlank, creatorTick, standbyId]);

  useEffect(() => {
    if (openId === null || shown) return;
    if (isPendingSettled(openId)) {
      closeInPlace(openId);
      return;
    }
    debugLog('[new-document] back-while-pending');
    const timer = window.setInterval(() => {
      if (isPendingSettled(openId)) closeInPlace(openId);
    }, IN_PLACE_SETTLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [openId, shown]);

  // One editor: the open document's, else the standby's, hidden in an Activity (rendered at the lowest priority, no
  // effects) until a click makes it the open one under the same key. The editor's component is loaded once and kept
  // (editor-page-loader.ts): the same component every render.
  const editorId = openId ?? standbyId;
  const editor = editorId !== null ? loadedEditorPage() : null;
  return (
    <>
      {shown ? null : children}
      {editor ? (
        <Activity mode={openId === null ? 'hidden' : 'visible'}>
          <div style={{ display: shown ? 'contents' : 'none' }}>
            <EditorSeedIdContext value={editorId}>
              <Suspense fallback={<OpeningScreen />}>
                {createElement(editor, { key: editorId })}
              </Suspense>
            </EditorSeedIdContext>
          </div>
        </Activity>
      ) : null}
    </>
  );
}
