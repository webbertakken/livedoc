// The editor's side of a text document's character limit (docs/specs/034-text-documents/live-editing-and-storage.md
// "Refused edits"): typing or a paste that would take the writing past TEXT_DOCUMENT_MAX_CHARS is refused before
// anything is sent. What arrives from the room is never refused here: the room has already taken it.
import { Plugin } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import { TEXT_DOCUMENT_MAX_CHARS } from '@livedoc/text-documents';
import type { TextDocumentLimit } from './text-document-bus';

// What a person reads when an edit passes a limit.
export const TEXT_DOCUMENT_LIMIT_NOTICES: Record<TextDocumentLimit, string> = {
  characters: `This text document has reached its limit of ${TEXT_DOCUMENT_MAX_CHARS.toLocaleString('en-GB')} characters.`,
  state: 'This text document has reached its size limit.',
};

export function textDocumentLimitPlugin({
  maxCharacters = TEXT_DOCUMENT_MAX_CHARS,
  onRefused,
}: {
  maxCharacters?: number;
  onRefused: () => void;
}): Plugin {
  return new Plugin({
    filterTransaction: (tr, state) => {
      if (!tr.docChanged) return true;
      const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
      if (sync?.isChangeOrigin) return true;
      // The document's size counts every character and more, and costs nothing: the text is read only near the limit.
      if (tr.doc.content.size <= maxCharacters) return true;
      const after = tr.doc.textContent.length;
      if (after <= maxCharacters || after <= state.doc.textContent.length) return true;
      onRefused();
      return false;
    },
  });
}
