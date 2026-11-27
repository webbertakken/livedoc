import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { cpuBudgetMs, cpuNowMs } from '@livedoc/vitest-config/cpu-time';
import { TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from '../text-document-state';
import {
  VIEWER_COPY_APPLY_BUDGET_MS,
  VIEWER_COPY_BUILD_BUDGET_MS,
  VIEWER_COPY_STATE_MAX_BYTES,
} from '../limits';
import { THREADS_MAP } from '../live/live-names';
import {
  anonymousAuthor,
  VIEWER_AUTHOR_COLOUR,
  VIEWER_AUTHOR_KEY_PREFIX,
  VIEWER_AUTHOR_NAME,
  ViewerCopy,
} from './viewer-copy';

// docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md "A Viewer's copy": the
// copy reads as the real state with every thread taken out and every suggestion's author anonymised, made
// incrementally or at once, and its bytes hold no thread, no author and no item of the real state.

/** A seeded generator (mulberry32): the same edits every run. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = [
  { key: 'key-ada-7f3', name: 'Ada Secretname', colour: '#0284c7' },
  { key: 'key-bo-91c', name: 'Bo Hiddenname', colour: '#c2410c' },
];
const THREAD_WORDS = 'Confidential remark';

type Json = unknown;

const sorted = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value ?? null, (_k, v: unknown) =>
      typeof v === 'object' && v !== null && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)))
        : v,
    ),
  );

/** A value with every suggestion's author made anonymous, at any depth, as a Viewer's copy holds it. */
function withAnonymousAuthor(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withAnonymousAuthor);
  if (typeof value !== 'object' || value === null) return value;
  const mark = Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, withAnonymousAuthor(v)]),
  ) as { id?: unknown; author?: unknown };
  return typeof mark.id === 'string' && mark.author !== undefined
    ? { ...mark, author: anonymousAuthor(mark.id) }
    : mark;
}

/** Runs side by side with the same formatting joined: drawn, they are one stretch of text. */
function joinedRuns(value: unknown): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.map(joinedRuns)) {
      const last = out.at(-1) as { type?: unknown; text?: unknown } | undefined;
      const next = item as { type?: unknown; text?: unknown } | undefined;
      const rest = (o: object) => JSON.stringify(sorted({ ...o, text: null }));
      if (last?.type === 'run' && next?.type === 'run' && rest(last) === rest(next))
        out[out.length - 1] = { ...last, text: `${String(last.text)}${String(next.text)}` };
      else out.push(item);
    }
    return out;
  }
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, joinedRuns(v)]));
  return value;
}

/** What a document reads as: every root but the threads, the writing with its formatting, the maps as JSON. */
function contentOf(doc: Y.Doc, redact: boolean): Json {
  const anon = (value: unknown): unknown => (redact ? withAnonymousAuthor(value) : value);
  const attrs = (o: Record<string, unknown> | undefined) =>
    o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, anon(v)])) : undefined;
  const node = (type: unknown): Json => {
    if (type instanceof Y.XmlText) {
      // Runs side by side with equal formatting read as one, as the editor draws them (Yjs joins only the same objects).
      const runs: { insert: unknown; attributes: Record<string, unknown> | undefined }[] = [];
      for (const op of type.toDelta() as {
        insert: unknown;
        attributes?: Record<string, unknown>;
      }[]) {
        const last = runs.at(-1);
        const attributes = attrs(op.attributes);
        if (
          last &&
          typeof last.insert === 'string' &&
          typeof op.insert === 'string' &&
          JSON.stringify(sorted(last.attributes)) === JSON.stringify(sorted(attributes))
        )
          last.insert += op.insert;
        else runs.push({ insert: op.insert, attributes });
      }
      return runs;
    }
    if (type instanceof Y.XmlElement)
      return {
        name: type.nodeName,
        attrs: attrs(type.getAttributes()),
        children: type.toArray().map(node),
      };
    return null;
  };
  const out: Record<string, Json> = {};
  for (const name of [...doc.share.keys()].sort()) {
    if (name === THREADS_MAP) continue;
    if (name === 'body' || name.startsWith('tab:') || name.startsWith('story:'))
      out[name] = doc.getXmlFragment(name).toArray().map(node);
    else out[name] = anon(doc.getMap(name).toJSON());
  }
  // A root with nothing in it reads as none.
  for (const [k, v] of Object.entries(out))
    if (
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && v && Object.keys(v).length === 0)
    )
      delete out[k];
  return out;
}

/** Random edits by two writers, each update handed on as the room stores it. */
function editing(seed: number) {
  const random = seeded(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const writers = [TextDocumentState.load(), TextDocumentState.load()];
  writers[0]!.clientID = 101;
  writers[1]!.clientID = 202;
  const stored: Uint8Array[] = [];
  const store = (from: Y.Doc, work: () => void) => {
    let update: Uint8Array | null = null;
    const take = (u: Uint8Array) => {
      update = update ? Y.mergeUpdates([update, u]) : u;
    };
    from.on('update', take);
    from.transact(work);
    from.off('update', take);
    if (!update) return;
    stored.push(update);
    for (const other of writers) if (other !== from) Y.applyUpdate(other, update);
  };
  let n = 0;
  const step = () => {
    const w = pick([0, 1]);
    const doc = writers[w]!;
    const person = PEOPLE[w]!;
    const fragmentName = random() < 0.15 ? 'tab:t.1' : 'body';
    const body = doc.getXmlFragment(fragmentName);
    const paragraphs = body.toArray().filter((c): c is Y.XmlElement => c instanceof Y.XmlElement);
    const mark = () => ({ id: `s${n++}`, at: n, author: person });
    const kind = random();
    store(doc, () => {
      if (paragraphs.length === 0 || kind < 0.15) {
        const p = new Y.XmlElement('paragraph');
        p.insert(0, [new Y.XmlText()]);
        if (random() < 0.3) p.setAttribute('insertion', mark() as never);
        body.insert(Math.floor(random() * (body.length + 1)), [p]);
        (p.get(0) as Y.XmlText).insert(0, `para${n++} `);
        return;
      }
      const p = pick(paragraphs);
      const text = p.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText);
      if (!text) return;
      const at = Math.floor(random() * (text.length + 1));
      if (kind < 0.35) text.insert(at, `w${n++} `, random() < 0.5 ? { insertion: mark() } : {});
      else if (kind < 0.45 && text.length > 2) text.delete(Math.min(at, text.length - 1), 1);
      else if (kind < 0.55 && text.length > 2)
        text.format(Math.min(at, text.length - 2), 2, { deletion: mark() });
      else if (kind < 0.62 && text.length > 2)
        text.format(Math.min(at, text.length - 2), 2, { bold: { value: random() < 0.5 } });
      else if (kind < 0.7) {
        // Accept or reject a suggestion in this paragraph.
        const ops = text.toDelta() as { insert: string; attributes?: Record<string, unknown> }[];
        let i = 0;
        for (const op of ops) {
          if (op.attributes?.insertion) {
            if (random() < 0.5) text.format(i, op.insert.length, { insertion: null });
            else text.delete(i, op.insert.length);
            return;
          }
          if (op.attributes?.deletion) {
            if (random() < 0.5) text.delete(i, op.insert.length);
            else text.format(i, op.insert.length, { deletion: null });
            return;
          }
          i += op.insert.length;
        }
      } else if (kind < 0.76) {
        if (p.getAttribute('insertion')) p.removeAttribute('insertion');
        else p.setAttribute('style', pick(['Heading_20_1', 'Title']));
      } else if (kind < 0.8 && paragraphs.length > 1) body.delete(body.toArray().indexOf(p), 1);
      else if (kind < 0.9) {
        const threads = doc.getMap<Y.Map<unknown>>(THREADS_MAP);
        const thread = new Y.Map<unknown>();
        const comment = new Y.Map<unknown>();
        comment.set('text', `${THREAD_WORDS} ${n}`);
        comment.set('author', { key: person.key, name: person.name, colour: person.colour });
        const comments = new Y.Map<unknown>();
        comments.set(`c${n}`, comment);
        thread.set('comments', comments);
        threads.set(`thread-${n++}`, thread);
      } else if (kind < 0.95) {
        const threads = doc.getMap<Y.Map<unknown>>(THREADS_MAP);
        const [first] = threads.keys();
        if (first) threads.get(first)!.set('resolved', true);
        else doc.getMap('document').set('pageless', random() < 0.5);
      } else doc.getMap('tabs').set('t.1', { name: `Tab ${n++}`, order: 1 });
    });
  };
  return { writers, stored, step };
}

describe('ViewerCopy', () => {
  it.each(Array.from({ length: 60 }, (_, i) => i + 1))(
    'reads as the real state without threads and authors, made as it goes or at once (seed %i)',
    (seed) => {
      const { writers, stored, step } = editing(seed);
      for (let i = 0; i < 40; i += 1) step();
      // A Viewer joins partway: the copy built from what is stored, the Viewer reading its state.
      let copy = ViewerCopy.build(stored);
      const client = copy.client;
      const viewer = new Y.Doc();
      Y.applyUpdate(viewer, copy.state());
      const frames: Uint8Array[] = [copy.state()];
      // Then everything goes on while they watch: suggestions made, accepted and rejected, threads added and resolved.
      for (let i = 0; i < 160; i += 1) {
        if (i === 80) {
          // The room is evicted while the Viewer watches: the copy is taken up again from what it kept, under its own
          // client, with nothing to catch up.
          copy.destroy();
          const restored = ViewerCopy.restore(stored, frames, client);
          expect(restored.caughtUp).toBeNull();
          copy = restored.copy;
        }
        const before = stored.length;
        step();
        for (const update of stored.slice(before)) {
          const gained = copy.apply(update);
          if (gained) {
            frames.push(gained);
            Y.applyUpdate(viewer, gained);
          }
        }
      }
      const expected = contentOf(writers[0]!, true);
      expect(contentOf(copy.doc, false)).toEqual(expected);
      expect(contentOf(viewer, false)).toEqual(expected);
      expect(contentOf(ViewerCopy.build(stored).doc, false)).toEqual(expected);
      // As drawn: the writing a reader makes of it, suggestions anonymised.
      const anonymise = (value: unknown): unknown =>
        JSON.parse(JSON.stringify(value, (_k, v: unknown) => withAnonymousAuthor(v)));
      expect(joinedRuns(TextDocumentState.document(viewer, 'odf').body)).toEqual(
        joinedRuns(anonymise(TextDocumentState.document(writers[1]!, 'odf').body)),
      );
      // Nothing of a thread or an author, and no item of the real state, in anything a Viewer received.
      const text = new TextDecoder('latin1').decode(Y.mergeUpdates(frames));
      for (const leak of [THREAD_WORDS, 'thread-', ...PEOPLE.flatMap((p) => [p.key, p.name])])
        expect(text, leak).not.toContain(leak);
      // The seed's items are every state's; the rest are the copy's own.
      const clients = new Set(
        Y.decodeUpdate(Y.encodeStateAsUpdate(viewer))
          .structs.map((s) => s.id.client)
          .filter((c) => c !== TEXT_DOCUMENT_SEED_CLIENT),
      );
      expect([...clients]).toEqual([client]);
      expect(copy.client).toBe(client);
      copy.destroy();
    },
  );

  it('takes a copy up again with nothing to catch up when it kept everything', () => {
    const { stored, step } = editing(7);
    for (let i = 0; i < 30; i += 1) step();
    const copy = ViewerCopy.build(stored);
    const kept = [copy.state()];
    const restored = ViewerCopy.restore(stored, kept, copy.client);
    expect(restored.caughtUp).toBeNull();
    expect(contentOf(restored.copy.doc, false)).toEqual(contentOf(copy.doc, false));
    // Writes after it go on under the kept client, past what it kept.
    const before = stored.length;
    while (stored.length === before) step();
    const gained = restored.copy.apply(stored.at(-1)!);
    if (gained)
      for (const s of Y.decodeUpdate(gained).structs) expect(s.id.client).toBe(copy.client);
    copy.destroy();
    restored.copy.destroy();
  });

  it('catches a copy taken up again up with writing it never copied over', () => {
    const real = TextDocumentState.load();
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText()]);
    real.getXmlFragment('body').insert(0, [p]);
    (p.get(0) as Y.XmlText).insert(0, 'Hello');
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const kept = [copy.state()];
    const viewer = new Y.Doc();
    Y.applyUpdate(viewer, copy.state());
    // Stored, but the room was gone before the copy took it.
    (p.get(0) as Y.XmlText).insert(5, ' world', {
      insertion: { id: 's1', at: 1, author: PEOPLE[1] },
    });
    real.getMap(THREADS_MAP).set('thread-9', THREAD_WORDS);
    const restored = ViewerCopy.restore([Y.encodeStateAsUpdate(real)], kept, copy.client);
    expect(restored.caughtUp).not.toBeNull();
    Y.applyUpdate(viewer, restored.caughtUp!);
    expect(contentOf(viewer, false)).toEqual(contentOf(real, true));
    const bytes = new TextDecoder('latin1').decode(restored.caughtUp!);
    for (const leak of [THREAD_WORDS, PEOPLE[1]!.name, PEOPLE[1]!.key])
      expect(bytes, leak).not.toContain(leak);
    copy.destroy();
    restored.copy.destroy();
  });

  it('refuses to take up a copy whose writing no longer lines up with the state', () => {
    const real = TextDocumentState.load();
    real.getXmlFragment('body').insert(0, [new Y.XmlElement('paragraph')]);
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const kept = [copy.state()];
    real.getXmlFragment('body').insert(0, [new Y.XmlElement('heading')]);
    // A kept copy of one paragraph against a state of two is no copy of it.
    expect(() => ViewerCopy.restore([Y.encodeStateAsUpdate(real)], kept, copy.client)).toThrow(
      /viewer copy does not line up/,
    );
    const other = TextDocumentState.load();
    other.getXmlFragment('body').insert(0, [new Y.XmlElement('heading')]);
    expect(() => ViewerCopy.restore([Y.encodeStateAsUpdate(other)], kept, copy.client)).toThrow(
      /viewer copy does not line up/,
    );
    copy.destroy();
  });

  it('pins the stated limit: a pending suggestion’s text reaches the Viewer, nothing of its author does', () => {
    const real = TextDocumentState.load();
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText()]);
    real.getXmlFragment('body').insert(0, [p]);
    (p.get(0) as Y.XmlText).insert(0, 'Proposed wording', {
      insertion: { id: 's1', at: 1, author: PEOPLE[0] },
    });
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const bytes = new TextDecoder('latin1').decode(copy.state());
    expect(bytes).toContain('Proposed wording');
    expect(bytes).not.toContain(PEOPLE[0]!.name);
    expect(bytes).not.toContain(PEOPLE[0]!.key);
    const [run] =
      (copy.doc.getXmlFragment('body').get(0) as Y.XmlElement).get(0) instanceof Y.XmlText
        ? ((
            (copy.doc.getXmlFragment('body').get(0) as Y.XmlElement).get(0) as Y.XmlText
          ).toDelta() as {
            attributes: { insertion: { author: unknown } };
          }[])
        : [];
    expect(run!.attributes.insertion.author).toEqual({
      key: `${VIEWER_AUTHOR_KEY_PREFIX}s1`,
      name: VIEWER_AUTHOR_NAME,
      colour: VIEWER_AUTHOR_COLOUR,
    });
    copy.destroy();
  });

  it('gives nothing for an update that changes only a thread', () => {
    const real = TextDocumentState.load();
    real.getXmlFragment('body').insert(0, [new Y.XmlElement('paragraph')]);
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const before = Y.encodeStateVector(real);
    real.getMap(THREADS_MAP).set('thread-1', 'secret');
    expect(copy.apply(Y.encodeStateAsUpdate(real, before))).toBeNull();
    copy.destroy();
  });
});

describe('ViewerCopy on a large document', () => {
  it('builds and copies updates over within its budgets', () => {
    const real = TextDocumentState.load();
    const body = real.getXmlFragment('body');
    const author = PEOPLE[0]!;
    real.transact(() => {
      for (let i = 0; i < 3000; i += 1) {
        const p = new Y.XmlElement('paragraph');
        const t = new Y.XmlText();
        p.insert(0, [t]);
        body.insert(i, [p]);
        t.insert(0, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5));
        if (i % 3 === 0) t.insert(20, 'proposed ', { insertion: { id: `s${i}`, at: i, author } });
        if (i % 5 === 0) t.format(40, 10, { deletion: { id: `d${i}`, at: i, author } });
      }
    });
    const state = Y.encodeStateAsUpdate(real);
    const built = cpuNowMs();
    const copy = ViewerCopy.build([state]);
    expect(cpuNowMs() - built).toBeLessThan(cpuBudgetMs(VIEWER_COPY_BUILD_BUDGET_MS));
    expect(copy.state().byteLength).toBeLessThan(VIEWER_COPY_STATE_MAX_BYTES);
    let slowest = 0;
    for (let k = 0; k < 20; k += 1) {
      const before = Y.encodeStateVector(real);
      ((body.get(1500 + k) as Y.XmlElement).get(0) as Y.XmlText).insert(5, 'y ', {
        insertion: { id: `n${k}`, at: k, author },
      });
      const update = Y.encodeStateAsUpdate(real, before);
      const started = cpuNowMs();
      copy.apply(update);
      slowest = Math.max(slowest, cpuNowMs() - started);
    }
    expect(slowest).toBeLessThan(cpuBudgetMs(VIEWER_COPY_APPLY_BUDGET_MS));
    copy.destroy();
  });
});

describe('ViewerCopy over every kind of type', () => {
  it('follows maps, arrays, texts and elements as they change, made or taken up again', () => {
    const real = TextDocumentState.load();
    const stored: Uint8Array[] = [];
    const change = (work: () => void) => {
      const before = Y.encodeStateVector(real);
      real.transact(work);
      stored.push(Y.encodeStateAsUpdate(real, before));
      return stored.at(-1)!;
    };
    const mark = (id: string) => ({ id, at: 1, author: PEOPLE[0] });
    const doc = real.getMap<unknown>('document');
    const body = real.getXmlFragment('body');
    change(() => {
      const nested = new Y.Map<unknown>();
      nested.set('a', 1);
      const list = new Y.Array<unknown>();
      const item = new Y.Map<unknown>();
      item.set('x', 1);
      list.insert(0, [1, item]);
      nested.set('list', list);
      const text = new Y.Text();
      text.insert(0, 'hi');
      nested.set('text', text);
      doc.set('nested', nested);
      const outer = new Y.XmlElement('table');
      const cell = new Y.XmlElement('cell');
      const run = new Y.XmlText();
      cell.insert(0, [run]);
      outer.insert(0, [cell]);
      outer.setAttribute('formatChange', mark('p1') as never);
      outer.setAttribute('rowSuggestions', [{ kept: mark('r1') }] as never);
      doc.set('somewhereNew', { nested: mark('m1') });
      body.insert(0, [outer]);
      run.insert(0, 'Cell', { deletion: mark('d1') });
    });
    let copy = ViewerCopy.build(stored);
    const frames = [copy.state()];
    const client = copy.client;
    const expectSame = () => {
      expect(contentOf(copy.doc, false)).toEqual(contentOf(real, true));
      const viewer = new Y.Doc();
      for (const frame of frames) Y.applyUpdate(viewer, frame);
      expect(contentOf(viewer, false)).toEqual(contentOf(real, true));
    };
    const step = (work: () => void) => {
      const gained = copy.apply(change(work));
      if (gained) frames.push(gained);
      expectSame();
    };
    expectSame();
    const nested = doc.get('nested') as Y.Map<unknown>;
    const list = nested.get('list') as Y.Array<unknown>;
    const table = body.get(0) as Y.XmlElement;
    step(() => nested.set('a', 2));
    step(() => nested.delete('a'));
    step(() => list.push([3]));
    step(() => (list.get(1) as Y.Map<unknown>).set('x', 2));
    step(() => (nested.get('text') as Y.Text).insert(2, ' there'));
    step(() => nested.set('text', 'plain now'));
    step(() => table.removeAttribute('formatChange'));
    step(() => table.setAttribute('style', 'Grid'));
    step(() => {
      const cell = new Y.XmlElement('cell');
      cell.insert(0, [new Y.XmlText('More')]);
      table.insert(1, [cell]);
    });
    step(() => table.delete(0, 1));
    step(() => real.getMap<unknown>('lists').set('l1', { kind: 'bullet' }));
    step(() => real.getXmlFragment('story:n1').insert(0, [new Y.XmlElement('paragraph')]));
    // Taken up again, it goes on under its own client.
    copy.destroy();
    const restored = ViewerCopy.restore(stored, frames, client);
    expect(restored.caughtUp).toBeNull();
    copy = restored.copy;
    step(() => list.delete(0, 1));
    step(() => body.delete(0, 1));
    expect(copy.client).toBe(client);
    copy.destroy();
  });

  it('refuses to take up a copy whose types differ from the state’s', () => {
    const real = TextDocumentState.load();
    real.getMap<unknown>('document').set('nested', new Y.Map());
    real.getXmlFragment('body').insert(0, [new Y.XmlElement('heading')]);
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const kept = [copy.state()];
    const other = TextDocumentState.load();
    other.getMap<unknown>('document').set('nested', new Y.Array());
    other.getXmlFragment('body').insert(0, [new Y.XmlText('x')]);
    expect(() => ViewerCopy.restore([Y.encodeStateAsUpdate(other)], kept, copy.client)).toThrow(
      /viewer copy does not line up/,
    );
    copy.destroy();
  });

  it('makes a redacted state at once and lets the copy go', () => {
    const real = TextDocumentState.load();
    real.getMap(THREADS_MAP).set('thread-1', THREAD_WORDS);
    const state = ViewerCopy.redacted([Y.encodeStateAsUpdate(real)]);
    expect(new TextDecoder('latin1').decode(state)).not.toContain(THREAD_WORDS);
  });
});

describe('ViewerCopy, what a change may hold', () => {
  it('copies an object in a line, a key set and taken back at once, and a text changed as it goes', () => {
    const real = TextDocumentState.load();
    const body = real.getXmlFragment('body');
    const text = new Y.XmlText();
    const para = new Y.XmlElement('paragraph');
    para.insert(0, [text]);
    body.insert(0, [para]);
    text.insert(0, 'Before after');
    text.insertEmbed(6, { equation: 'x^2' }, { insertion: { id: 'e1', at: 1, author: PEOPLE[1] } });
    const copy = ViewerCopy.build([Y.encodeStateAsUpdate(real)]);
    const apply = (work: () => void) => {
      const before = Y.encodeStateVector(real);
      real.transact(work);
      return copy.apply(Y.encodeStateAsUpdate(real, before));
    };
    apply(() => {
      real.getMap<unknown>('document').set('fleeting', 1);
      real.getMap<unknown>('document').delete('fleeting');
    });
    // A paragraph whose text changes as it is taken away goes with its parent.
    apply(() => {
      text.insert(0, 'x');
      body.delete(0, 1);
    });
    expect(contentOf(copy.doc, false)).toEqual(contentOf(real, true));
    copy.destroy();
  });
});
