import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LANE_NAME_MAX, LANES_MAX, SUGGESTION_REASON_MAX } from '@livedoc/document';
import { suggestNotesShape } from './storm-schema';

// docs/specs/015-api/mcp-server.md §4.9f and docs/specs/021-event-storming/lane-plans.md "How an agent suggests one".

describe('suggest_notes: lanes', () => {
  const shape = z.object(suggestNotesShape);
  const lane = { name: 'Kitchen', lanes: [1, 2] };
  const parse = (extra: Record<string, unknown>) => shape.safeParse({ documentId: 'd1', ...extra });

  it('takes a lane plan: each lane a name and what it holds, said four ways, with why', () => {
    const parsed = parse({
      lanes: [
        { name: 'Orders', contexts: ['x1'], notes: ['e3'] },
        { name: 'Kitchen', lanes: [2, 3], kinds: ['policy', 'domain-event'] },
      ],
      lanesReason: 'Two parts of the business',
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses a name too long, a lane number that is none, an unknown kind and a reason too long', () => {
    expect(parse({ lanes: [lane, { name: 'x'.repeat(LANE_NAME_MAX + 1) }] }).success).toBe(false);
    expect(parse({ lanes: [lane, { name: 'Bar', lanes: [0] }] }).success).toBe(false);
    expect(parse({ lanes: [lane, { name: 'Bar', lanes: [1.5] }] }).success).toBe(false);
    expect(parse({ lanes: [lane, { name: 'Bar', kinds: ['saga'] }] }).success).toBe(false);
    expect(
      parse({ lanes: [lane, lane], lanesReason: 'x'.repeat(SUGGESTION_REASON_MAX + 1) }).success,
    ).toBe(false);
  });

  it('takes no more lanes than a board may have', () => {
    const many = Array.from({ length: LANES_MAX + 1 }, (_, i) => ({ name: `Lane ${i + 1}` }));
    expect(parse({ lanes: many }).success).toBe(false);
    expect(parse({ lanes: many.slice(1) }).success).toBe(true);
  });
});
