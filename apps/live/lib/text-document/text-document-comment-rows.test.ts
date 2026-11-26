// docs/specs/034-text-documents/review.md "The comments panel": the rows, by tab then as begun; a deleted stretch.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LiveThreads,
  TextDocumentState,
  type DocumentTab,
  type TextDocumentComment,
} from '@livedoc/text-documents';
import { commentNoteOf, commentRows, sharedComment, tabGroups } from './text-document-comment-rows';

const ADA: TextDocumentComment = {
  id: 'c',
  text: 'hm',
  at: 1,
  author: { key: 'k', name: 'Ada', colour: '#0284c7' },
};

function documentWith(text: string) {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text }]);
  const paragraph = TextDocumentState.body(doc).get(0) as Y.XmlElement;
  const node = paragraph.get(0) as Y.XmlText;
  const at = (index: number, assoc: number) =>
    Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(node, index, assoc));
  const begin = (id: string, tab: string, from: number, to: number, at0 = 1) =>
    LiveThreads.begin(
      doc,
      {
        id,
        tab,
        start: at(from, 0),
        end: at(to - 1, -1),
        quote: text.slice(from, to),
        comment: { ...ADA, id: `${id}.c`, at: at0 },
      },
      null,
    );
  return { doc, node, begin };
}

const tab = (id: string, name: string, emoji?: string): DocumentTab => ({
  id,
  name,
  depth: 0,
  body: [],
  ...(emoji ? { emoji } : {}),
});

describe('commentRows', () => {
  it('orders the rows by tab in the outline’s order, then as begun', () => {
    const { doc, begin } = documentWith('quarterly results are in');
    begin('late', 't.0', 0, 4, 3);
    begin('other', 't.b', 0, 4, 1);
    begin('early', 't.0', 5, 9, 2);
    begin('lost', 't.gone', 0, 4, 0);
    const rows = commentRows(doc, LiveThreads.read(doc), [tab('t.0', 'One'), tab('t.b', 'Two')]);
    expect(rows.map((r) => r.id)).toEqual(['early', 'late', 'other', 'lost']);
    expect(rows[0]).toMatchObject({ label: 'erly', group: 't.0', resolved: false, deleted: false });
  });

  it('puts the first tab first when the outline does not list it', () => {
    const { doc, begin } = documentWith('quarterly results');
    begin('b', 't.b', 0, 4, 1);
    begin('a', 't.0', 0, 4, 2);
    expect(commentRows(doc, LiveThreads.read(doc), []).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('marks a thread whose text is gone as deleted', () => {
    const { doc, node, begin } = documentWith('quarterly results');
    begin('a', 't.0', 0, 9);
    node.delete(0, 9);
    expect(commentRows(doc, LiveThreads.read(doc), [])[0]!.deleted).toBe(true);
  });
});

describe('sharedComment', () => {
  it('carries the key as the author id and a file’s comment as from the file', () => {
    expect(sharedComment(ADA)).toMatchObject({ authorId: 'k', authorName: 'Ada' });
    const file = sharedComment({
      ...ADA,
      author: { name: 'Bo', colour: '#6b7280', fromFile: true },
    });
    expect(file.authorId).toBeUndefined();
    expect(commentNoteOf(file)).toBe('From the file');
    expect(commentNoteOf(sharedComment(ADA))).toBeNull();
  });

  // review.md "Mentions": the chips are drawn from the comment's mentions, a file's (no account) too; a malformed one
  // is left out.
  it('carries the mentions a chip is drawn from, a file’s too, and leaves out a malformed one', () => {
    const priya = {
      userId: 'u-priya',
      memberId: 'm-priya',
      name: 'Priya Kaur',
      handle: 'priya-kaur',
    };
    const fromFile = { userId: null, name: 'Bo Lee', handle: 'bo-lee' };
    expect(
      sharedComment({ ...ADA, mentions: [priya, fromFile, { handle: 7 }, 'x'] }).mentions,
    ).toEqual([priya, fromFile]);
    expect(sharedComment({ ...ADA, mentions: [] }).mentions).toBeUndefined();
    expect(sharedComment(ADA).mentions).toBeUndefined();
  });
});

describe('tabGroups', () => {
  it('names each tab, its emoji first', () => {
    expect(tabGroups([tab('t.0', 'One'), tab('t.b', 'Two', '📌')])).toEqual([
      { id: 't.0', label: 'One' },
      { id: 't.b', label: '📌 Two' },
    ]);
  });
});
