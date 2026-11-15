// What builds a new document's content, and with it every template's builders (about 280 KiB gzipped): loaded when a document
// is made, never with the page that offers to make one (docs/specs/016-platform/web-performance.md "What makes a
// document loads when one is made"). The Explorer's New Document menu and /new share this one loader, so a fetch ahead
// and the make that follows reuse one request.
export const loadNewDocumentContent = () => import('@/lib/new-document-content');

// Starts the fetch without waiting on it; a failure is left to the make, whose own import asks again and reports it.
export function fetchNewDocumentContentAhead(): void {
  void loadNewDocumentContent().catch(() => {});
}
