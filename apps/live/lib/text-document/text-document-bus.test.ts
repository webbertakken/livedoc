import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextDocumentBus } from './text-document-bus';

// docs/specs/034-text-documents/live-editing-and-storage.md "Sending" and "Reconnecting".
describe('TextDocumentBus', () => {
  afterEach(() => TextDocumentBus.disconnected());

  it('hands a tab its updates, and asks only its surface to re-read when it goes stale', () => {
    const updates = vi.fn();
    const resyncs = vi.fn();
    const offUpdate = TextDocumentBus.onUpdate('t1', updates);
    const offResync = TextDocumentBus.onResync(resyncs);
    TextDocumentBus.deliver({ tabId: 't1', update: 'AAA=' });
    TextDocumentBus.deliver({ tabId: 't2', update: 'AAA=' });
    TextDocumentBus.deliver({ tabId: 't1', update: '***' });
    expect(updates).toHaveBeenCalledTimes(1);
    TextDocumentBus.deliver({ tabId: 't1', stale: true });
    expect(resyncs).toHaveBeenCalledWith('t1');
    offUpdate();
    offResync();
    TextDocumentBus.deliver({ tabId: 't1', update: 'AAA=' });
    TextDocumentBus.resync(null);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(resyncs).toHaveBeenCalledTimes(1);
  });

  // live-editing-and-storage.md "Refused edits": the refused tab's surface is told which limit.
  it('tells a tab of an edit the room refused, and no other', () => {
    const seen: string[] = [];
    const off = TextDocumentBus.onRefused('t1', (limit) => seen.push(limit));
    TextDocumentBus.refused('t2', 'state');
    TextDocumentBus.refused('t1', 'characters');
    off();
    TextDocumentBus.refused('t1', 'state');
    expect(seen).toEqual(['characters']);
  });

  it('says when the room opens and closes, once per close', () => {
    const seen: boolean[] = [];
    const off = TextDocumentBus.onConnection((open) => seen.push(open));
    expect(TextDocumentBus.isConnected()).toBe(false);
    TextDocumentBus.connected();
    expect(TextDocumentBus.isConnected()).toBe(true);
    TextDocumentBus.disconnected();
    TextDocumentBus.disconnected();
    off();
    TextDocumentBus.connected();
    expect(seen).toEqual([true, false]);
  });
});
