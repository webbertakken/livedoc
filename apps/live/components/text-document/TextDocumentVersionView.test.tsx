// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Version history": the document tab being read, drawn at the version; one
// made since says it did not exist yet.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { versionAuthorship } from '@/lib/text-document/text-document-version-authorship';
import { TextDocumentVersionView, VERSION_TAB_MISSING } from './TextDocumentVersionView';

afterEach(cleanup);

const where = { ownerId: 'me', documentId: 'D', shareCode: null };

describe('TextDocumentVersionView', () => {
  it('draws a tab held at the version, and says when it was made since', async () => {
    const doc = new Y.Doc({ gc: false });
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Hello')]);
    TextDocumentState.body(doc).insert(0, [paragraph]);
    const snapshot = Y.snapshot(doc);
    const drawing = {
      snapshot,
      previous: snapshot,
      authorship: versionAuthorship({ clients: {}, deletedBy: {} }),
      showChanges: false,
    };
    const state = Y.encodeStateAsUpdate(doc);
    const { rerender } = render(
      <TextDocumentVersionView
        state={state}
        tab="t.0"
        drawing={drawing}
        format="odf"
        where={where}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Document body at this version' }).textContent,
      ).toBe('Hello'),
    );
    expect(screen.queryByText(VERSION_TAB_MISSING)).toBeNull();
    rerender(
      <TextDocumentVersionView
        state={state}
        tab="t.9"
        drawing={drawing}
        format="odf"
        where={where}
      />,
    );
    expect(screen.getByText(VERSION_TAB_MISSING)).toBeTruthy();
  });
});
