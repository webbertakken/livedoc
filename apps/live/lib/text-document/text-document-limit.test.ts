// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import { textDocumentSchema } from './text-document-schema';
import { TEXT_DOCUMENT_LIMIT_NOTICES, textDocumentLimitPlugin } from './text-document-limit';

// docs/specs/034-text-documents/live-editing-and-storage.md "Refused edits": the editor refuses growth past the limit.
describe('textDocumentLimitPlugin', () => {
  function state(onRefused = vi.fn()) {
    const doc = textDocumentSchema.node('doc', null, [
      textDocumentSchema.node('paragraph', null, [textDocumentSchema.text('abcd')]),
    ]);
    return {
      onRefused,
      state: EditorState.create({
        doc,
        plugins: [textDocumentLimitPlugin({ maxCharacters: 5, onRefused })],
      }),
    };
  }

  it('lets writing grow up to the limit, refuses it past, and says so', () => {
    const { state: s, onRefused } = state();
    const five = s.apply(s.tr.insertText('e', 5));
    expect(five.doc.textContent).toBe('abcde');
    const six = five.apply(five.tr.insertText('f', 6));
    expect(six.doc.textContent).toBe('abcde');
    expect(onRefused).toHaveBeenCalledTimes(1);
  });

  it('never refuses a deletion, or what arrives from the room', () => {
    const { state: s, onRefused } = state();
    const full = s.apply(s.tr.insertText('e', 5));
    const remote = full.tr.insertText('zz', 1).setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const over = full.apply(remote);
    expect(over.doc.textContent).toBe('zzabcde');
    const shorter = over.apply(over.tr.delete(1, 2));
    expect(shorter.doc.textContent).toBe('zabcde');
    expect(onRefused).not.toHaveBeenCalled();
  });
});

describe('TEXT_DOCUMENT_LIMIT_NOTICES', () => {
  it("says each limit in the spec's words", () => {
    expect(TEXT_DOCUMENT_LIMIT_NOTICES.characters).toBe(
      'This text document has reached its limit of 1,020,000 characters.',
    );
    expect(TEXT_DOCUMENT_LIMIT_NOTICES.state).toBe(
      'This text document has reached its size limit.',
    );
  });
});
