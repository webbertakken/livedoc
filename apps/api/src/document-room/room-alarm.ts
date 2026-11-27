// A room's alarm never strands its outbox (docs/specs/006-document/document-storage.md "The outbox", Never stranded;
// issue #802): each part of the alarm runs whatever another part threw, and an outbox owed for long is named by its
// age, so a room that lay without an alarm until a wake is seen.

/** An outbox owed longer than this when it drains is logged as overdue (document-storage.md, (default)). */
export const OUTBOX_OVERDUE_MS = 600_000;
/** When the outbox last came to owe D1, from empty; gone once it owes nothing. */
export const OUTBOX_OWED_SINCE_KEY = 'outbox:owedSince';

type Kv = Pick<SyncKvStorage, 'get' | 'put' | 'delete'> | undefined;

/** Runs one part of an alarm; a failure is logged by name and kept from the parts after it. */
export async function alarmPart(
  documentId: string | null,
  part: string,
  run: () => unknown,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[room-alarm] failed id=${documentId ?? 'unbound'} part=${part}`, error);
  }
}

/** The outbox owes D1: when it first came to, kept unless already kept. */
export function noteOwed(kv: Kv, now: number): void {
  if (kv && typeof kv.get(OUTBOX_OWED_SINCE_KEY) !== 'number') kv.put(OUTBOX_OWED_SINCE_KEY, now);
}

/** A drain is starting: an outbox owed past OUTBOX_OVERDUE_MS is named, with its keys and age. */
export function reportOverdue(kv: Kv, documentId: string, keys: number, now: number): void {
  const since = kv?.get(OUTBOX_OWED_SINCE_KEY);
  if (typeof since !== 'number' || now - since <= OUTBOX_OVERDUE_MS) return;
  console.warn(
    `[outbox] overdue id=${documentId} keys=${keys} age=${Math.round((now - since) / 60_000)}m`,
  );
}

/** The outbox owes nothing: no age is kept. */
export function clearOwed(kv: Kv): void {
  if (kv && kv.get(OUTBOX_OWED_SINCE_KEY) !== undefined) kv.delete(OUTBOX_OWED_SINCE_KEY);
}
