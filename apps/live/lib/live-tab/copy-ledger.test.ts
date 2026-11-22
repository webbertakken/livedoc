import { describe, expect, it } from 'vitest';
import { CopyLedger } from './copy-ledger';

// docs/specs/034-text-documents/live-editing-and-storage.md "The local copy": kept until the room has confirmed every
// edit (each op's cursor, or a catch-up that finds nothing missing).
describe('CopyLedger', () => {
  it('is clean with nothing sent, and once every send is confirmed', () => {
    let ledger = CopyLedger.empty();
    expect(CopyLedger.isClean(ledger)).toBe(true);
    ledger = CopyLedger.sent(CopyLedger.sent(ledger));
    expect(CopyLedger.isClean(ledger)).toBe(false);
    ledger = CopyLedger.settled(ledger, true);
    expect(CopyLedger.isClean(ledger)).toBe(false);
    ledger = CopyLedger.settled(ledger, true);
    expect(CopyLedger.isClean(ledger)).toBe(true);
  });

  it('stays unclean after a send the room did not confirm, until a catch-up', () => {
    let ledger = CopyLedger.settled(CopyLedger.sent(CopyLedger.empty()), false);
    expect(CopyLedger.isClean(ledger)).toBe(false);
    ledger = CopyLedger.caughtUp(ledger, ledger.generation);
    expect(CopyLedger.isClean(ledger)).toBe(true);
  });

  it('keeps an edit held while the room was closed until a catch-up covers it', () => {
    const held = CopyLedger.held(CopyLedger.empty());
    expect(CopyLedger.isClean(held)).toBe(false);
    const begun = held.generation;
    // Another edit held while the catch-up is on its way: that catch-up does not cover it.
    const later = CopyLedger.held(held);
    expect(CopyLedger.isClean(CopyLedger.caughtUp(later, begun))).toBe(false);
    expect(CopyLedger.isClean(CopyLedger.caughtUp(later, later.generation))).toBe(true);
  });

  it('never counts below zero', () => {
    expect(CopyLedger.settled(CopyLedger.empty(), true).awaiting).toBe(0);
  });
});
