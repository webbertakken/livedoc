// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Sharing": a new drawing is a new tab, so Insert > Drawing > New is for an
// Editor who may change the document's tabs; a link to one tab adds none, and finds New dimmed.
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const surface = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    surface.props = props;
    return null;
  },
}));
const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/document/[id]/EditorContext', () => ({ useEditorContext: () => ctx.value }));
vi.mock('@/components/chrome/lines/editor-lines-context', () => ({ useEditorLines: () => null }));
vi.mock('@/hooks/persistence/useIsOfflineDocument', () => ({ useIsOfflineDocument: () => false }));
vi.mock('./useEditorDrawingTabs', () => ({ useEditorDrawingTabs: () => null }));

const { TextDocumentHost } = await import('./TextDocumentHost');

const text: Tab = { id: 'w', name: 'Notes', kind: 'text-document', elements: [] };

function editor(isStructureReadOnly: boolean) {
  ctx.value = {
    documentId: 'D',
    selfParticipant: { id: 'me' },
    sessionShareCode: null,
    roomRef: { current: null },
    can: { textDocumentEdits: true, level: 'edit' },
    documentName: 'Plan',
    documentList: [],
    addDrawingTab: vi.fn(() => 'd1'),
    isStructureReadOnly,
    accountId: 'u-me',
    commentMentions: { notifyMentioned, notifyAssigned },
  };
}
const notifyMentioned = vi.fn();
const notifyAssigned = vi.fn();

beforeEach(() => {
  surface.props = null;
});

describe('TextDocumentHost', () => {
  it('lets an Editor who may add tabs make a new drawing', () => {
    editor(false);
    render(<TextDocumentHost tab={text} />);
    expect(typeof surface.props?.createDrawing).toBe('function');
  });

  it('makes none on a link to one tab, which adds no tabs', () => {
    editor(true);
    render(<TextDocumentHost tab={text} />);
    expect(surface.props?.createDrawing).toBeNull();
  });

  it('makes none in the read-only pane of a split', () => {
    editor(false);
    render(<TextDocumentHost tab={text} readOnly />);
    expect(surface.props?.createDrawing).toBeNull();
  });

  // review.md "Mentions": the reader's account reads For you; a comment's mentions reach the editor's notify.
  it('hands the surface the reader’s account and the editor’s mention notify', () => {
    editor(false);
    render(<TextDocumentHost tab={text} />);
    expect(surface.props?.mentions).toEqual({
      selfUserId: 'u-me',
      onMentioned: notifyMentioned,
      onAssigned: notifyAssigned,
    });
  });
});
