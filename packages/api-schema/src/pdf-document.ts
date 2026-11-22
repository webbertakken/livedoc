// What a PDF document's doors say on the wire (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage").

/** The header a PDF document's state answer names its stored file in: the tab's `blob`, the key the live changes
 *  are on. A surface fetches that file before it applies anything. */
export const PDF_STORED_FILE_HEADER = 'X-Stored-File';
