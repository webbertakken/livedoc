// The zip export of an Event Storming board (docs/specs/021-event-storming/domain-export.md "The zip"): the wire
// contract between the api route that reads the board and asks the model, and the editor that writes the zip.

// POST /api/documents/:id/tabs/:tabId/storm-export
export type StormExportRequest = {
  // One of DOMAIN_EXPORT_LANGUAGES (@livedoc/storm-reading).
  language: string;
  // An earlier zip's text files by path, read in the browser, when the export updates one.
  previous?: Record<string, string>;
  // The bundle alone, without asking the model: the dialog's fallback when the model failed.
  bundleOnly?: boolean;
};

export type StormExportResponse = {
  // The zip's files by path, in the order they are written.
  files: Record<string, string>;
  // True when the deployment's model wrote the spec and the types; false for the bundle alone.
  written: boolean;
};

export type StormExportError =
  | 'not_event_storming'
  | 'language_invalid'
  | 'board_too_large'
  | 'previous_invalid'
  | 'previous_too_large'
  | 'ai_failed';
