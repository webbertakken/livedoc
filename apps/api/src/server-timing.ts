// Server-Timing on a document's answers (docs/specs/016-platform/web-performance.md "The api"): where a document
// request's time goes, read from the response itself. The worker times its call to the room (`room`); the room
// times its wake (`room-wake`, on the first request after it woke only), its ready gate (`room-gate`), every D1
// round trip in order (`room-d1-<n>`) and its handler (`room-handler`).
//
// Only a successful answer carries them: a refusal timed step by step would show which gate a caller failed, which
// is how a guessed document id tells "exists" from "does not".
//
// A Worker's clock moves only across I/O, which is exactly what these measures are about; CPU time is the deploy's
// own metric.

const HEADER = 'Server-Timing';

type Statement = D1PreparedStatement;

// What a wrapper does not time, as the wrapped object answers it, methods bound to it.
function passThrough(target: object, key: string | symbol): unknown {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
}

export class ServerTiming {
  private readonly entries: string[] = [];
  private d1Trips = 0;

  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  add(name: string, ms: number): void {
    this.entries.push(`${name};dur=${Math.max(0, Math.round(ms))}`);
  }

  async measure<T>(name: string, run: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await run();
    } finally {
      this.add(name, this.now() - start);
    }
  }

  // The same database, every round trip timed: a statement run on its own is one, a batch is one.
  d1(db: D1Database): D1Database {
    const timeTrip = <T>(run: () => Promise<T>): Promise<T> =>
      this.measure(`room-d1-${++this.d1Trips}`, run);
    const real = new WeakMap<object, Statement>();
    const wrap = (statement: Statement): Statement => {
      const wrapped = new Proxy(statement, {
        get(target, key) {
          if (key === 'bind') {
            return (...values: unknown[]) => wrap(target.bind(...values));
          }
          if (key === 'first' || key === 'all' || key === 'run' || key === 'raw') {
            const terminal = target[key] as (...args: unknown[]) => Promise<unknown>;
            return (...args: unknown[]) => timeTrip(() => terminal.apply(target, args));
          }
          return passThrough(target, key);
        },
      });
      real.set(wrapped, statement);
      return wrapped;
    };
    return new Proxy(db, {
      get(target, key) {
        if (key === 'prepare') return (query: string) => wrap(target.prepare(query));
        if (key === 'batch') {
          return <T>(statements: Statement[]) =>
            timeTrip(() => target.batch<T>(statements.map((s) => real.get(s) ?? s)));
        }
        return passThrough(target, key);
      },
    });
  }

  header(): string {
    return this.entries.join(', ');
  }
}

// The answer with the timing appended to what it already carries; a refusal or failure carries none.
export function withServerTiming(response: Response, timing: ServerTiming): Response {
  const ok = response.status >= 200 && response.status < 300;
  const inner = response.headers.get(HEADER);
  const value = [inner, timing.header()].filter(Boolean).join(', ');
  if (ok ? value === (inner ?? '') : inner === null) return response;
  // A Response from a fetch or an RPC has immutable headers.
  const answer = new Response(response.body, response);
  if (ok) answer.headers.set(HEADER, value);
  else answer.headers.delete(HEADER);
  return answer;
}
