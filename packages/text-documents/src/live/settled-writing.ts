// The writing as settling every pending suggestion would leave it (docs/specs/034-text-documents/review.md "Editing
// modes", Viewing; "Reviewing suggestions", Preview): a document of its own, made once from the live one with every
// suggestion accepted or rejected, then kept reading as a copy made now by the least change to each writing (each
// tab's body and the stories it shows), so an editor bound to it sees only what changed. Never sent anywhere.
import * as Y from 'yjs';
import { tabFragment } from './live-root';
import { liveWritings, storyFragment } from './live-stories';
import { LiveSuggestions } from './live-suggestions';
import { syncWriting } from './writing-sync';

export const SettledWriting = {
  /** Whether the document holds any pending suggestion: without one, its writing is already settled. */
  pending: (live: Y.Doc): boolean => LiveSuggestions.count(live) > 0,

  /** The document as settling every suggestion one way would leave it, the document untouched. */
  make: (live: Y.Doc, accept: boolean): Y.Doc => LiveSuggestions.settledCopy(live, accept),

  /** Makes `drawn` read as the document settled now, changing only what differs, in one transaction. */
  refresh: (drawn: Y.Doc, live: Y.Doc, accept: boolean): void => {
    const now = LiveSuggestions.settledCopy(live, accept);
    try {
      drawn.transact(() => {
        for (const { tab, story, fragment } of liveWritings(now))
          syncWriting(
            fragment,
            story === undefined ? tabFragment(drawn, tab) : storyFragment(drawn, story),
          );
      });
    } finally {
      now.destroy();
    }
  },
} as const;
