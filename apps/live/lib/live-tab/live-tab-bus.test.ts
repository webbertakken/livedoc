import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveTabRoom, liveTabBus } from './live-tab-bus';

// docs/specs/006-document/kinds-outside-the-canvas.md "Live state": a bus per kind, one connection state for every
// kind, and a re-hydrate that asks every kind's open surfaces to catch up.
describe('liveTabBus', () => {
  afterEach(() => LiveTabRoom.disconnected());

  it("delivers a kind's updates and refusals to its own tab's surface, never another kind's", () => {
    const text = liveTabBus<'characters'>('[one]');
    const pdf = liveTabBus<'state'>('[two]');
    const textUpdates = vi.fn();
    const pdfUpdates = vi.fn();
    const pdfRefusals = vi.fn();
    const stops = [
      text.onUpdate('t1', textUpdates),
      pdf.onUpdate('t1', pdfUpdates),
      pdf.onRefused('t1', pdfRefusals),
    ];
    pdf.deliver({ tabId: 't1', update: 'AAA=' });
    pdf.deliver({ tabId: 't2', update: 'AAA=' });
    pdf.deliver({ tabId: 't1', update: '***' });
    pdf.refused('t1', 'state');
    pdf.refused('t2', 'state');
    expect(pdfUpdates).toHaveBeenCalledTimes(1);
    expect(pdfRefusals.mock.calls).toEqual([['state']]);
    expect(textUpdates).not.toHaveBeenCalled();
    for (const stop of stops) stop();
    pdf.deliver({ tabId: 't1', update: 'AAA=' });
    pdf.refused('t1', 'state');
    expect(pdfUpdates).toHaveBeenCalledTimes(1);
    expect(pdfRefusals).toHaveBeenCalledTimes(1);
  });

  it("asks one tab's surface to catch up when its state went stale, and every kind's on a re-hydrate", () => {
    const text = liveTabBus('[one]');
    const pdf = liveTabBus('[two]');
    const textResyncs = vi.fn();
    const pdfResyncs = vi.fn();
    const stops = [text.onResync(textResyncs), pdf.onResync(pdfResyncs)];
    pdf.deliver({ tabId: 't1', stale: true });
    expect(pdfResyncs.mock.calls).toEqual([['t1']]);
    expect(textResyncs).not.toHaveBeenCalled();
    LiveTabRoom.resyncAll();
    expect(pdfResyncs.mock.calls).toEqual([['t1'], [null]]);
    expect(textResyncs.mock.calls).toEqual([[null]]);
    for (const stop of stops) stop();
    LiveTabRoom.resyncAll();
    expect(textResyncs).toHaveBeenCalledTimes(1);
  });

  it('tells every kind of the one room opening and closing, once each', () => {
    const text = liveTabBus('[one]');
    const pdf = liveTabBus('[two]');
    const seen: boolean[] = [];
    const stop = pdf.onConnection((open) => seen.push(open));
    expect(pdf.isConnected()).toBe(false);
    text.connected();
    expect(pdf.isConnected()).toBe(true);
    expect(LiveTabRoom.isConnected()).toBe(true);
    LiveTabRoom.disconnected();
    LiveTabRoom.disconnected();
    expect(text.isConnected()).toBe(false);
    stop();
    LiveTabRoom.connected();
    expect(seen).toEqual([true, false]);
  });
});
