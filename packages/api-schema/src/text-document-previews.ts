// A text document's page previews on the wire (docs/specs/034-text-documents/agents-and-sync.md "Page previews"):
// each page asked as SVG in CSS pixels, how many pages the document tab has, and that the pages are approximate.

/** The tab route's last segment: `GET /documents/:id/tabs/:tabId/page-previews`. */
export const TEXT_DOCUMENT_PAGE_PREVIEWS_SEGMENT = 'page-previews';

export type TextDocumentPagePreview = {
  number: number;
  width: number;
  height: number;
  svg: string;
};

export type TextDocumentPagePreviewsResponse = {
  pages: TextDocumentPagePreview[];
  pageCount: number;
  approximate: true;
};
