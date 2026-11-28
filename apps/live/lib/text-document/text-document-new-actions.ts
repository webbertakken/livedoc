// File > New in a text document (docs/specs/034-text-documents/starting-and-finding.md "Where the gallery shows"):
// Document opens a blank text document and From template gallery opens the gallery's page, each in a new browser tab,
// as Google's do.
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';

export const NEW_BLANK_HREF = '/new?kind=text-document';
export const NEW_FROM_GALLERY_HREF = '/new?gallery=text-document';

export function textDocumentNewActions(open: (href: string) => void): OfficeActions {
  return {
    'new-document': {
      run: () => {
        track('UI', 'Used', 'TextDocumentFileNew');
        open(NEW_BLANK_HREF);
      },
    },
    'new-from-template': {
      run: () => {
        track('UI', 'Used', 'TextDocumentFileNewFromGallery');
        open(NEW_FROM_GALLERY_HREF);
      },
    },
  };
}

/** The editor's: each in a new browser tab, which cannot reach back into this one. */
export const TEXT_DOCUMENT_NEW_ACTIONS = textDocumentNewActions((href) => {
  window.open(href, '_blank', 'noopener');
});
