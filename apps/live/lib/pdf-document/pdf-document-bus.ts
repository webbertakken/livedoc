// Where a PDF document's live changes from the room meet its surface (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Storage", "The room's op kinds"): the PDF document's bus, as every live tab kind has one
// (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"). Every editor loads it: nothing of the engine or
// the model may come with it.
import type { LiveTabLimitName, LiveTabRefusalName } from '@livedoc/api-schema';
import { liveTabBus } from '@/lib/live-tab/live-tab-bus';

/** Why the room refused a change, as it names it in `pdf-refused`: the limit passed, or the refusal's name. */
export type PdfDocumentRefusal = LiveTabLimitName | LiveTabRefusalName;

export const PdfDocumentBus = liveTabBus<PdfDocumentRefusal>('[pdf]');
