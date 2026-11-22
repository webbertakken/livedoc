import { describe, expect, it } from 'vitest';
import { deliveryKey } from './delivery-key';
import { sampleDelivery } from './test-delivery';

// docs/specs/016-platform/worker-issues.md "Once only": the delivery key.

describe('deliveryKey', () => {
  it('is the automation run when the payload names one', async () => {
    expect(await deliveryKey(sampleDelivery(), 'run_1')).toEqual({ key: 'run:run_1', kind: 'run' });
  });

  it('is a hash of the payload without its ts otherwise', async () => {
    const a = await deliveryKey(sampleDelivery({ ts: 1 }), null);
    const b = await deliveryKey(sampleDelivery({ ts: 2 }), null);
    expect(a.kind).toBe('body');
    expect(a.key).toMatch(/^body:[0-9a-f]{64}$/);
    expect(b).toEqual(a);
  });

  it('tells two different payloads apart', async () => {
    const a = await deliveryKey(sampleDelivery({ trigger: 'occurrence_threshold' }), null);
    const b = await deliveryKey(sampleDelivery({ trigger: 'recurrence_after_inactivity' }), null);
    expect(a.key).not.toBe(b.key);
  });

  it('cuts a very long run id to a bounded key', async () => {
    const { key } = await deliveryKey({}, 'r'.repeat(500));
    expect(key).toBe(`run:${'r'.repeat(200)}`);
  });
});
