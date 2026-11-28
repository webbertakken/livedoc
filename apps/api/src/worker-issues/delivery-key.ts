// What makes two deliveries the same one (docs/specs/016-platform/worker-issues.md "Once only"): the automation run
// Cloudflare retries, else a hash of the payload without its `ts`, so a resend of the same notification is the same.
import { sha256Hex } from '@livedoc/api-schema';

// `scan-digest` is the day's shared key of answered scans (worker-issues.md "Vulnerability scans").
export type DeliveryKey = { key: string; kind: 'run' | 'body' | 'scan-digest' };

// A run id longer than this is cut: the ledger's key stays small whatever a payload sends.
const RUN_ID_MAX = 200;

export async function deliveryKey(
  payload: Record<string, unknown>,
  runId: string | null,
): Promise<DeliveryKey> {
  if (runId) return { key: `run:${runId.slice(0, RUN_ID_MAX)}`, kind: 'run' };
  const { ts: _ts, ...rest } = payload;
  const hash = await sha256Hex(new TextEncoder().encode(JSON.stringify(rest)));
  return { key: `body:${hash}`, kind: 'body' };
}
