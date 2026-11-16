import { describe, expect, it } from 'vitest';
import { sqliteD1 } from './test-sqlite-d1';
import { IsolateFirstUse, ServerTiming, withServerTiming } from './server-timing';

// A clock the test moves by hand, so every duration is exact.
function manualClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => void (now += ms) };
}

describe('ServerTiming', () => {
  it('lists each measure in the order it was added', () => {
    const timing = new ServerTiming(() => 0);
    timing.add('room-wake', 12.4);
    timing.add('room-gate', 3);
    expect(timing.header()).toBe('room-wake;dur=12, room-gate;dur=3');
  });

  it('times what it measures, and passes its answer through', async () => {
    const clock = manualClock();
    const timing = new ServerTiming(clock.now);
    const answer = await timing.measure('room-gate', async () => {
      clock.advance(40);
      return 'ready';
    });
    expect(answer).toBe('ready');
    expect(timing.header()).toBe('room-gate;dur=40');
  });

  it('times a measure that throws, and lets the throw through', async () => {
    const clock = manualClock();
    const timing = new ServerTiming(clock.now);
    await expect(
      timing.measure('room-gate', async () => {
        clock.advance(7);
        throw new Error('not ready');
      }),
    ).rejects.toThrow('not ready');
    expect(timing.header()).toBe('room-gate;dur=7');
  });

  it('is empty until something is measured', () => {
    expect(new ServerTiming(() => 0).header()).toBe('');
  });
});

describe('ServerTiming.d1', () => {
  it('numbers and times every D1 round trip, a batch as one', async () => {
    const { env, sql } = sqliteD1();
    sql.exec(
      "INSERT INTO participants (id, name, color, created_at) VALUES ('p1', 'Ada', '#000', 1)",
    );
    const clock = manualClock();
    const timing = new ServerTiming(clock.now);
    const db = timing.d1(env.DB);

    const row = await db.prepare('SELECT name FROM participants WHERE id = ?').bind('p1').first();
    const all = await db.prepare('SELECT id FROM participants').all();
    await db.batch([
      db.prepare('SELECT 1').bind(),
      db.prepare('SELECT name FROM participants WHERE id = ?').bind('p1'),
    ]);

    expect(row).toEqual({ name: 'Ada' });
    expect(all.results).toEqual([{ id: 'p1' }]);
    expect(timing.header()).toBe('room-d1-1;dur=0, room-d1-2;dur=0, room-d1-3;dur=0');
  });

  it('runs a statement prepared through it exactly as D1 would', async () => {
    const { env } = sqliteD1();
    const timing = new ServerTiming(() => 0);
    const db = timing.d1(env.DB);
    await db
      .prepare('INSERT INTO participants (id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .bind('p2', 'Grace', '#fff', 2)
      .run();
    const row = await env.DB.prepare('SELECT name FROM participants WHERE id = ?')
      .bind('p2')
      .first<{ name: string }>();
    expect(row?.name).toBe('Grace');
  });
});

describe('withServerTiming', () => {
  it('adds the measures to a successful answer', () => {
    const timing = new ServerTiming(() => 0);
    timing.add('room', 5);
    const res = withServerTiming(new Response('{}', { status: 200 }), timing);
    expect(res.headers.get('Server-Timing')).toBe('room;dur=5');
  });

  it('appends to measures the answer already carries', () => {
    const timing = new ServerTiming(() => 0);
    timing.add('room', 5);
    const inner = new Response('{}', { headers: { 'Server-Timing': 'room-gate;dur=1' } });
    const res = withServerTiming(inner, timing);
    expect(res.headers.get('Server-Timing')).toBe('room-gate;dur=1, room;dur=5');
  });

  it('adds nothing to a refusal or a failure, which would time the gate a caller failed', () => {
    const timing = new ServerTiming(() => 0);
    timing.add('room-d1-1', 5);
    for (const status of [400, 403, 404, 503]) {
      const res = withServerTiming(new Response('{}', { status }), timing);
      expect(res.headers.get('Server-Timing')).toBeNull();
    }
  });

  it('strips measures a refusal carries from inside', () => {
    const timing = new ServerTiming(() => 0);
    const inner = new Response('{}', { status: 404, headers: { 'Server-Timing': 'x;dur=1' } });
    expect(withServerTiming(inner, timing).headers.get('Server-Timing')).toBeNull();
  });
});

describe('IsolateFirstUse', () => {
  it('is first once, then never again', () => {
    const isolate = new IsolateFirstUse();
    expect(isolate.take()).toBe(true);
    expect(isolate.take()).toBe(false);
  });
});
