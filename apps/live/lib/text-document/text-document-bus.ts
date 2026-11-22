// Where a text document's updates from the room meet its surface (docs/specs/034-text-documents/
// live-editing-and-storage.md "The live model", "Sending", "Reconnecting"): the text document's bus, as every live tab
// kind has one (docs/specs/006-document/kinds-outside-the-canvas.md "Live state").
import { liveTabBus, type LiveTabDelivery } from '@/lib/live-tab/live-tab-bus';

/** The limit an edit passed ("Refused edits"). */
export type TextDocumentLimit = 'characters' | 'state';

/** What a `text-document` op from the room carries: an update, or that the tab's state must be read again. */
export type TextDocumentDelivery = LiveTabDelivery;

export const TextDocumentBus = liveTabBus<TextDocumentLimit>('[text-document]');
