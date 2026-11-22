// What the room has confirmed of this browser's edits to one text document tab (docs/specs/034-text-documents/
// live-editing-and-storage.md "The local copy"): the local copy is kept while the ledger is not clean, and deleted once
// it is. Pure: the provider holds one and replaces it on every event.

export type CopyLedger = {
  // Sends of this browser's edits awaiting the room's word.
  readonly awaiting: number;
  // Edits the room may lack: made while the room was closed, or sent and not confirmed.
  readonly unsent: boolean;
  // Bumped each time an edit becomes unsent, so a catch-up clears only what it covered.
  readonly generation: number;
};

export const CopyLedger = {
  empty: (): CopyLedger => ({ awaiting: 0, unsent: false, generation: 0 }),
  /** An edit made while the room is closed: nothing goes out until the next catch-up. */
  held: (ledger: CopyLedger): CopyLedger => ({
    ...ledger,
    unsent: true,
    generation: ledger.generation + 1,
  }),
  /** An edit (or a catch-up's missing part) sent to the room. */
  sent: (ledger: CopyLedger): CopyLedger => ({ ...ledger, awaiting: ledger.awaiting + 1 }),
  /** The room's word on one send: stored, or not known to be (the socket dropped, the door refused, no answer). */
  settled: (ledger: CopyLedger, stored: boolean): CopyLedger => {
    const awaiting = Math.max(0, ledger.awaiting - 1);
    return stored
      ? { ...ledger, awaiting }
      : { awaiting, unsent: true, generation: ledger.generation + 1 };
  },
  /** A catch-up begun at `generation` found the room holding everything this browser had then (or stored what it
   *  lacked): what became unsent since is still unsent. */
  caughtUp: (ledger: CopyLedger, generation: number): CopyLedger =>
    ledger.generation === generation ? { ...ledger, unsent: false } : ledger,
  /** Whether the room holds every edit made here: the local copy is then no longer needed. */
  isClean: (ledger: CopyLedger): boolean => ledger.awaiting === 0 && !ledger.unsent,
} as const;
