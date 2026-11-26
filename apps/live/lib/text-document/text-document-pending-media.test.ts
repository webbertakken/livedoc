// docs/specs/034-text-documents/review.md "Pictures": the media a paste or a drop brings is written in the change that
// puts its pictures in, never on its own, and never when that change is refused.
import { describe, expect, it, vi } from 'vitest';
import { ySyncPluginKey } from 'y-prosemirror';
import { TextDocumentState } from '@livedoc/text-documents';
import { pendingMedia } from './text-document-pending-media';

const PNG = { mediaType: 'image/png', image: 'img-1' } as const;

describe('pendingMedia', () => {
  it('writes what is queued with the next change, in its transaction, once', () => {
    const doc = TextDocumentState.load();
    const origins: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => origins.push(origin));
    const pending = pendingMedia(() => doc);
    pending.queue({ k1: PNG });
    const write = vi.fn(() => {
      expect((doc as unknown as { _transaction: unknown })._transaction).not.toBeNull();
      expect(TextDocumentState.media(doc, 'k1')).toEqual(PNG);
    });
    pending.apply(write);
    expect(write).toHaveBeenCalledOnce();
    expect(origins).toEqual([ySyncPluginKey]);
    const plain = vi.fn();
    pending.apply(plain);
    expect(plain).toHaveBeenCalledOnce();
    expect(origins).toHaveLength(1);
  });

  it('forgets what is queued when the change is refused', () => {
    const doc = TextDocumentState.load();
    const pending = pendingMedia(() => doc);
    pending.queue({ k1: PNG });
    pending.drop();
    pending.apply(() => {});
    expect(TextDocumentState.media(doc, 'k1')).toBeUndefined();
  });
});
