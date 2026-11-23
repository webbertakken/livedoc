'use client';

// What fills the pages' place while a PDF has no pages to show (docs/specs/035-pdf-documents/opening.md
// "Passwords", "Refusals"): the open password's screen, a refusal by name, a PDF gone from the document, or a tab that
// could not load. Nothing while the PDF opens or once its pages show.
import {
  PDF_REFUSAL_GLYPH,
  pdfRefusalDownloads,
  pdfRefusalRetries,
  pdfRefusalWords,
} from '@/lib/pdf-document/pdf-refusals';
import type { PdfDocumentOpen } from '@/lib/pdf-document/usePdfDocument';
import { PdfNotice, PdfNoticeButton } from './PdfNotice';
import { PdfPasswordScreen } from './PdfPasswordScreen';

export function PdfOpenNotices({
  open,
  onTryAgain,
  onDownload,
}: {
  open: PdfDocumentOpen;
  onTryAgain: () => void;
  onDownload: () => void;
}) {
  switch (open.phase) {
    case 'locked':
      return <PdfPasswordScreen tries={open.tries} unlock={open.unlock} onDownload={onDownload} />;
    case 'refused': {
      const { sentence, then } = pdfRefusalWords(open.refusal);
      return (
        <PdfNotice sentence={sentence} then={then} glyph={PDF_REFUSAL_GLYPH[open.refusal]}>
          {pdfRefusalRetries(open.refusal) ? (
            <PdfNoticeButton onClick={onTryAgain}>Try again</PdfNoticeButton>
          ) : null}
          {open.storedFile && pdfRefusalDownloads(open.refusal) ? (
            <PdfNoticeButton onClick={onDownload}>Download</PdfNoticeButton>
          ) : null}
        </PdfNotice>
      );
    }
    case 'gone':
      return <PdfNotice sentence="This PDF is no longer in this document." />;
    case 'failed':
      return (
        <PdfNotice role="alert" sentence="This tab couldn’t load.">
          <PdfNoticeButton onClick={onTryAgain}>Try Again</PdfNoticeButton>
        </PdfNotice>
      );
    default:
      return null;
  }
}
