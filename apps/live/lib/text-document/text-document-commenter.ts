// Who comments in a text document's session (docs/specs/034-text-documents/review.md "Threads in the margin", Who).
// Kept apart from the threads' hook so the host decides it without loading the editor.

/** Who comments in this session: the key they sign with, their name and colour, and whether they delete any comment. */
export type TextDocumentCommenter = {
  readonly key: string;
  readonly name: string;
  readonly colour: string;
  readonly mayDeleteAny: boolean;
};

/**
 * Who comments in a session (review.md "Threads in the margin", Who): an Editor or a Participant with the key its room
 * ticket carries; in This Browser, where there is no room, the person's own participant key, never their owner id;
 * nobody in a read-only pane, a Viewer, or a session with no key.
 */
export function commenterOf(input: {
  commentKey: string | null;
  level: 'edit' | 'participate' | 'view';
  self: { readonly key?: string; readonly name: string; readonly color: string };
  local: boolean;
  readOnly: boolean;
}): TextDocumentCommenter | null {
  const { commentKey, level, self, local, readOnly } = input;
  if (readOnly || level === 'view') return null;
  const key = local ? (self.key ?? null) : commentKey;
  if (!key) return null;
  return { key, name: self.name, colour: self.color, mayDeleteAny: level === 'edit' };
}
