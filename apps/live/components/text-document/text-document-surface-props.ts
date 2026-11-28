// What a text document's editing surface is given (docs/specs/034-text-documents/editing-surface.md): the document's
// scope and format, the session's share level and room, and the editor's parts around it.
import type { AccessLevel } from '@livedoc/api-schema';
import type { CommentMention, TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import type { TextDocumentFrame } from '@/lib/text-document/room-yjs-provider';
import type { OfficeCommenter } from '@/lib/office/review/office-commenter';
import type { DrawingTabs } from '@/lib/text-document/text-document-drawing-open-plugin';
import type { LinkDocument } from '@/lib/text-document/text-document-links';
import type { OfficeChrome } from '@/components/office/office-chrome';
import type { TextDocumentThreadArrival } from './useTextDocumentThreadArrival';

export type TextDocumentSurfaceProps = {
  scope: TextDocumentScope;
  documentName: string;
  format: TextDocumentFormat;
  canEdit: boolean;
  // The session's share level: what the menus show (editing-surface.md "The menu bar").
  level: AccessLevel;
  // One frame to the room; true once the room has stored it ("Sending").
  sequence: (op: TextDocumentFrame) => Promise<boolean>;
  // A text document in This Browser: no room; its state lives in its offline record ("A text document in This
  // Browser"). Fixed for the surface's life: its host keys it by this.
  local?: boolean;
  // The title row's document parts (editing-surface.md "The title row"); null in the read-only pane of a split.
  chrome?: OfficeChrome | null;
  // The person's LiveDoc documents, which the link editor offers and the link card names (links-and-navigation.md).
  documents?: readonly LinkDocument[];
  // Adds an empty drawing tab of this tab and opens it (objects.md "Drawings"); absent where none may be added.
  createDrawing?: (() => string | null) | null;
  // The editor's drawing tabs (objects.md "Opening it again"); absent outside an editor, where drawings stay their PNGs.
  drawingTabs?: DrawingTabs | null;
  // Who comments in this session (review.md "Threads in the margin"); null where it reads the threads alone.
  commenter?: OfficeCommenter | null;
  // Who reads the comments, and the email a comment's mentions ask for (review.md "Mentions"); absent outside an editor.
  mentions?: TextDocumentMentions | null;
  // The thread an Inbox row asked to go to (docs/specs/013-workspace/inbox.md §1.8); absent outside an editor.
  arrival?: TextDocumentThreadArrival | null;
  // Names the tab's format after a conversion (standard-mapping.md "Conversion"); absent where it may not be converted.
  setFormat?: ((format: TextDocumentFormat) => void) | null;
};

/** The reader's account (For you reads it) and what a comment added with mentions tells the editor. */
export type TextDocumentMentions = {
  readonly selfUserId: string | null;
  readonly onMentioned: (text: string, mentions: readonly CommentMention[]) => void;
  /** A comment that assigns its thread was added: email the assignee (review.md "Assigning"). */
  readonly onAssigned: (text: string, assignee: CommentMention) => void;
};
