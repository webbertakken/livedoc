import { describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn<(category: string, action: string, type: string) => void>());
vi.mock('@/lib/telemetry', () => ({ track }));

import {
  NEW_BLANK_HREF,
  NEW_FROM_GALLERY_HREF,
  textDocumentNewActions,
} from './text-document-new-actions';

// docs/specs/034-text-documents/starting-and-finding.md "Where the gallery shows".
describe('File > New in a text document', () => {
  it('opens a blank text document, and the template gallery, each in a new browser tab', () => {
    const open = vi.fn<(href: string) => void>();
    const actions = textDocumentNewActions(open);
    actions['new-document']!.run();
    actions['new-from-template']!.run();
    expect(open.mock.calls).toEqual([['/new?kind=text-document'], ['/new?gallery=text-document']]);
    expect([NEW_BLANK_HREF, NEW_FROM_GALLERY_HREF]).toEqual(open.mock.calls.flat());
    expect(track.mock.calls).toEqual([
      ['UI', 'Used', 'TextDocumentFileNew'],
      ['UI', 'Used', 'TextDocumentFileNewFromGallery'],
    ]);
  });
});
