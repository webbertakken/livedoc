// The office title row's save status (docs/specs/034-text-documents/editing-surface.md "The title row"): one of five,
// reported by the kind, drawn by the shell with its words and what they mean.
export type OfficeSaveStatus = 'saving' | 'saved' | 'this-browser' | 'offline' | 'failed';

export const OFFICE_SAVE_STATUS: Record<OfficeSaveStatus, { words: string; meaning: string }> = {
  saving: { words: 'Saving…', meaning: 'Your latest changes are on their way to LiveDoc.' },
  saved: { words: 'All changes saved', meaning: 'LiveDoc holds every change made here.' },
  'this-browser': {
    words: 'Saved in This Browser',
    meaning:
      "This document lives only in this browser. Clearing this browser's site data deletes it.",
  },
  offline: {
    words: 'Offline: changes are kept in this browser',
    meaning: 'They are sent to LiveDoc as soon as the connection is back.',
  },
  failed: {
    words: "Can't save: we keep trying",
    meaning:
      'Your latest changes have not been saved yet. Keep this tab open while LiveDoc tries again.',
  },
};

// The words show beside the glyph only while something is not yet safe (default): saved states are the glyph alone.
export const isUnsettled = (status: OfficeSaveStatus): boolean =>
  status === 'saving' || status === 'offline' || status === 'failed';
