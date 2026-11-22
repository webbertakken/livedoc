// Where a PDF document's live changes from the room meet its surface (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Storage", "The room's op kinds"): the PDF document's bus, as every live tab kind has one
// (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"). Every editor loads it: nothing of the engine or
// the model may come with it.
import { liveTabBus } from '@/lib/live-tab/live-tab-bus';

/** The limit a change passed, as the room names it in `pdf-refused` ("Limits"). */
export type PdfDocumentLimit = 'characters' | 'state';

export const PdfDocumentBus = liveTabBus<PdfDocumentLimit>('[pdf]');
