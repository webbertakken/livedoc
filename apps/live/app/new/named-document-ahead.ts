// A /new address that names a document to make (?template=<kind>, ?blank=1; docs/specs/007-editor/new-document-route.md)
// needs what makes it and the editor's code at once. Called as the page's module first runs, before hydration, so both
// download beside the page's own code (docs/specs/016-platform/web-performance.md "What makes a document loads when
// one is made"). The static export also evaluates the page without a window: nothing is named there.
import { loadEditorPage } from '@/lib/editor-page-loader';
import { fetchNewDocumentContentAhead } from '@/lib/new-document/new-document-content-loader';
import { wizardBypassKind } from '@/lib/new-document-params';

export function fetchAheadForNamedDocument(): boolean {
  if (typeof window === 'undefined' || !wizardBypassKind(window.location.search)) return false;
  fetchNewDocumentContentAhead();
  loadEditorPage().catch(() => {});
  return true;
}
