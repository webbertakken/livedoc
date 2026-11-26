// The media a paste or a drop brings (docs/specs/034-text-documents/review.md "Pictures"): queued as the clipboard reads
// it, and written in the change that puts its pictures in, so the room receives, and judges, one update and no one holds
// a picture without its media; forgotten when that change is refused.
import type * as Y from 'yjs';
import { ySyncPluginKey } from 'y-prosemirror';
import { TextDocumentState, type PictureMedia } from '@livedoc/text-documents';

type Media = Readonly<Record<string, PictureMedia>>;

export type PendingMedia = {
  /** Queues media to write with the next change. */
  readonly queue: (media: Media) => void;
  /** Runs `write` (the change applied to the view), with what is queued written first in the same transaction. */
  readonly apply: (write: () => void) => void;
  /** Forgets what is queued: its change was refused. */
  readonly drop: () => void;
};

/** Writes `media` and runs `write` in one transaction of the editor's origin, so they are one update and one undo step. */
export function writeWithMedia(doc: Y.Doc, media: Media, write: () => void): void {
  doc.transact(() => {
    TextDocumentState.addMedia(doc, media);
    write();
  }, ySyncPluginKey);
}

export function pendingMedia(doc: () => Y.Doc | null): PendingMedia {
  let queued: Media | null = null;
  return {
    queue: (media) => {
      queued = { ...queued, ...media };
    },
    apply: (write) => {
      const media = queued;
      const target = doc();
      queued = null;
      if (media && target) writeWithMedia(target, media, write);
      else write();
    },
    drop: () => {
      queued = null;
    },
  };
}
