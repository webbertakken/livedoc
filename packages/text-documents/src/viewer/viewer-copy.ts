// A Viewer's copy of a text document's live state (docs/specs/034-text-documents/review.md "What a Viewer receives";
// live-editing-and-storage.md "A Viewer's copy"). A Viewer receives no comment thread and nothing of who suggested what,
// so the room keeps, per tab, a copy written by a client of its own: the writing and the document's maps cloned from the
// real state, every thread left out, every suggestion's author replaced by an anonymous one made from the suggestion's
// id alone. No item, client id or key of the real state is in it, so nothing of a thread or an author can be read back
// from its bytes. Each stored update is applied to a mirror of the real state; what it changed is copied over, type by
// type, and Viewers receive only what the copy gained. A Viewer never writes, so the copy is theirs alone to read.
// What stays, the stated limit: where suggestions are, their ids and times, and the text a pending one would add.
import * as Y from 'yjs';
import { THREADS_MAP } from '../live/live-names';
import { BODY_FRAGMENT, TAB_FRAGMENT_PREFIX } from '../live/live-root';
import { STORY_PREFIX } from '../live/live-stories';
import { isObject } from '../live/live-suggestion-marks';
import { TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from '../text-document-state';
import type { TextDocumentCommentAuthor } from '../live/live-threads';

/** The prefix of an anonymous author's key; the rest is the suggestion's id. */
export const VIEWER_AUTHOR_KEY_PREFIX = 'viewer:';
/** An anonymous author's name and colour: the same for every suggestion (default). */
export const VIEWER_AUTHOR_NAME = 'Someone';
export const VIEWER_AUTHOR_COLOUR = '#5f6368';

/** The Yjs types a text document's state holds. */
type Shared = Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.Text | Y.Map<unknown> | Y.Array<unknown>;

const sharedOf = (value: unknown): Shared | null =>
  value instanceof Y.XmlFragment ||
  value instanceof Y.XmlText ||
  value instanceof Y.Text ||
  value instanceof Y.Map ||
  value instanceof Y.Array
    ? (value as Shared)
    : null;
type Container = Y.XmlFragment | Y.XmlElement;
type Unit = {
  insert: unknown;
  attributes: Record<string, unknown> | undefined;
  marks: string;
  key: string;
};
type Run = { insert: unknown; attributes: Record<string, unknown> | undefined };

/** The anonymous author of one suggestion: its id is all it is made from. */
export const anonymousAuthor = (suggestionId: string): TextDocumentCommentAuthor => ({
  key: `${VIEWER_AUTHOR_KEY_PREFIX}${suggestionId}`,
  name: VIEWER_AUTHOR_NAME,
  colour: VIEWER_AUTHOR_COLOUR,
});

/**
 * A value with every suggestion's author in it anonymised, at any depth: whatever carries an id and an author (a
 * suggestion's mark, on whatever format, attribute or key it rides) is taken as a suggestion, so no key the copy does
 * not know of can carry a name through.
 */
function anonymised(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anonymised);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) out[key] = anonymised(inner);
  if (typeof value.id === 'string' && value.author !== undefined)
    out.author = anonymousAuthor(value.id);
  return out;
}

const isFragmentName = (name: string) =>
  name === BODY_FRAGMENT || name.startsWith(TAB_FRAGMENT_PREFIX) || name.startsWith(STORY_PREFIX);

/** A text run's formatting with its suggestion marks anonymised. */
function textAttributes(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) out[key] = anonymised(value);
  return out;
}

/** A value as JSON with every object's keys sorted. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );

/** A text's content as units (a character, or an object in a line), its formatting redacted, comparable by key. */
function unitsOf(text: Y.XmlText | Y.Text): Unit[] {
  const units: Unit[] = [];
  for (const op of text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    const attributes = textAttributes(op.attributes);
    // Compared by content, whatever order the keys came in.
    const marks = attributes ? canonical(attributes) : '';
    if (typeof op.insert === 'string') {
      for (const char of op.insert)
        units.push({ insert: char, attributes, marks, key: `${char}\u0000${marks}` });
    } else {
      units.push({
        insert: op.insert,
        attributes,
        marks,
        key: `\u0001${JSON.stringify(op.insert)}\u0000${marks}`,
      });
    }
  }
  return units;
}

/** Units joined back into runs: characters side by side with the same formatting are one insert. */
function runsOf(units: readonly Unit[]): Run[] {
  const runs: (Run & { marks: string })[] = [];
  for (const unit of units) {
    const last = runs.at(-1);
    if (
      last &&
      typeof last.insert === 'string' &&
      typeof unit.insert === 'string' &&
      last.marks === unit.marks
    )
      last.insert += unit.insert;
    else runs.push({ insert: unit.insert, attributes: unit.attributes, marks: unit.marks });
  }
  return runs.map(({ insert, attributes }) => ({ insert, attributes }));
}

/** What makes `copy` read as `real`: the stretch between their common start and end, replaced. */
function syncText(real: Y.XmlText | Y.Text, copy: Y.XmlText | Y.Text): void {
  const want = unitsOf(real);
  const have = unitsOf(copy);
  let start = 0;
  while (start < want.length && start < have.length && want[start]!.key === have[start]!.key)
    start += 1;
  let end = 0;
  while (
    end < want.length - start &&
    end < have.length - start &&
    want[want.length - 1 - end]!.key === have[have.length - 1 - end]!.key
  )
    end += 1;
  const removed = have.length - start - end;
  const added = want.slice(start, want.length - end);
  if (removed === 0 && added.length === 0) return;
  const delta: { retain?: number; delete?: number; insert?: unknown; attributes?: object }[] = [];
  if (start > 0) delta.push({ retain: start });
  if (removed > 0) delta.push({ delete: removed });
  // Each inserted unit carries its whole formatting, nulls for what it lacks, so nothing leaks in from beside it.
  let before = have[start - 1]?.attributes ?? {};
  for (const run of runsOf(added)) {
    const attributes: Record<string, unknown> = {};
    for (const key of Object.keys(before)) attributes[key] = null;
    Object.assign(attributes, run.attributes ?? {});
    delta.push({ insert: run.insert, attributes });
    before = run.attributes ?? {};
  }
  copy.applyDelta(delta, { sanitize: false });
}

export class ViewerCopy {
  /** The copy Viewers read. */
  readonly doc: Y.Doc;
  /** The mirror of the real state, which stored updates are applied to. */
  private readonly real: Y.Doc;
  // Each real type's copy, and each copy's real type; let go with the types.
  private readonly twins = new WeakMap<Shared, Shared>();
  private readonly owners = new WeakMap<Shared, Shared>();

  private constructor(real: Y.Doc, kept?: Y.Doc) {
    this.real = real;
    this.doc = kept ?? new Y.Doc({ gc: true });
    if (kept) return;
    // Every state stands on the seed, the copy too: its items are the same in both, so they are twins.
    Y.applyUpdate(this.doc, TextDocumentState.seed());
    const seeded: Shared[] = [];
    this.linkSeed(
      real.getXmlFragment(BODY_FRAGMENT),
      this.doc.getXmlFragment(BODY_FRAGMENT),
      seeded,
    );
    this.doc.transact(() => {
      for (const name of [...real.share.keys()]) this.root(name);
      // The seed's twins were never cloned: what the state wrote in them is copied over now.
      this.sync(seeded);
    });
  }

  /** The client the copy is written by: kept with the copy, so it can be taken up again. */
  get client(): number {
    return this.doc.clientID;
  }

  /**
   * A copy taken up again from what it kept (its own updates) beside the real state, written on by the same client, so
   * a Viewer's editor goes on merging with it; `caughtUp` is what it gained to read as the state now, or null. Throws
   * when the kept copy's writing does not line up with the state's: it is no copy of it, and a new one must be made.
   */
  static restore(
    updates: readonly Uint8Array[],
    kept: readonly Uint8Array[],
    client: number,
  ): { copy: ViewerCopy; caughtUp: Uint8Array | null } {
    const real = new Y.Doc({ gc: true });
    real.transact(() => {
      Y.applyUpdate(real, TextDocumentState.seed());
      for (const update of updates) Y.applyUpdate(real, update);
    });
    const doc = new Y.Doc({ gc: true });
    doc.transact(() => {
      for (const update of kept) Y.applyUpdate(doc, update);
    });
    // Set after the kept updates: Yjs gives a document a new client when a remote update writes as its own.
    doc.clientID = client;
    const copy = new ViewerCopy(real, doc);
    try {
      for (const name of [...real.share.keys()]) {
        if (name === THREADS_MAP) continue;
        if (isFragmentName(name))
          copy.linkExact(real.getXmlFragment(name), doc.getXmlFragment(name));
        else copy.linkExact(real.getMap<unknown>(name), doc.getMap<unknown>(name));
      }
    } catch (error) {
      copy.destroy();
      throw error;
    }
    let caughtUp: Uint8Array | null = null;
    const take = (written: Uint8Array) => {
      caughtUp = written;
    };
    doc.on('update', take);
    try {
      doc.transact(() => {
        for (const name of [...real.share.keys()])
          if (!copy.twins.has(sharedOf(real.share.get(name))!)) copy.root(name);
        copy.sync(everyType(real));
      });
    } finally {
      doc.off('update', take);
    }
    return { copy, caughtUp };
  }

  /** A copy of the state, redacted. */
  static build(updates: readonly Uint8Array[]): ViewerCopy {
    const real = new Y.Doc({ gc: true });
    real.transact(() => {
      Y.applyUpdate(real, TextDocumentState.seed());
      for (const update of updates) Y.applyUpdate(real, update);
    });
    return new ViewerCopy(real);
  }

  /** A state as a Viewer may hold it, made by a copy let go at once (a Viewer's file or document copy). */
  static redacted(updates: readonly Uint8Array[]): Uint8Array {
    const copy = ViewerCopy.build(updates);
    try {
      return copy.state();
    } finally {
      copy.destroy();
    }
  }

  /** One stored update: applied to the mirror, its changes copied over; what the copy gained, or null for nothing. */
  apply(update: Uint8Array): Uint8Array | null {
    // Every transaction the update makes: Yjs tidies a text's formatting in one of its own after the update's.
    const changed = new Set<Shared>();
    // A root an update makes is not yet a map or a fragment: it is named, and made one as it is copied.
    const roots = new Set<string>();
    const note = (transaction: Y.Transaction) => {
      for (const type of transaction.changed.keys()) {
        const known = sharedOf(type);
        if (known) changed.add(known);
        else if (type._item === null)
          for (const [name, root] of this.real.share) if (root === type) roots.add(name);
      }
    };
    this.real.on('afterTransaction', note);
    try {
      Y.applyUpdate(this.real, update);
    } finally {
      this.real.off('afterTransaction', note);
    }
    let gained: Uint8Array | null = null;
    const take = (written: Uint8Array) => {
      gained = written;
    };
    this.doc.on('update', take);
    try {
      this.doc.transact(() => {
        for (const name of roots) this.root(name);
        this.sync([...changed]);
      });
    } finally {
      this.doc.off('update', take);
    }
    return gained;
  }

  /** The copy's state, or what it holds beyond a reader's state vector. */
  state(since?: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, since);
  }

  destroy(): void {
    this.real.destroy();
    this.doc.destroy();
  }

  /** A root of the real state copied, unless it holds the threads. */
  private root(name: string): void {
    if (name === THREADS_MAP) return;
    if (isFragmentName(name)) {
      const real = this.real.getXmlFragment(name);
      const copy = this.doc.getXmlFragment(name);
      this.link(real, copy);
      this.syncChildren(real, copy);
      return;
    }
    const real = this.real.getMap<unknown>(name);
    const copy = this.doc.getMap<unknown>(name);
    this.link(real, copy);
    for (const key of real.keys()) this.syncKey(real, copy, key);
  }

  private link(real: Shared, copy: Shared): void {
    this.twins.set(real, copy);
    this.owners.set(copy, real);
  }

  /** The changed types copied over, parents first; a type with no twin is new under a parent that copies it whole. */
  private sync(changed: readonly Shared[]): void {
    const depth = (type: Shared) => {
      let n = 0;
      for (let item = type._item; item; item = sharedOf(item.parent)?._item ?? null) n += 1;
      return n;
    };
    for (const type of [...changed].sort((a, b) => depth(a) - depth(b))) {
      // A type taken away goes with its parent's change.
      if (type._item?.deleted) continue;
      const twin = this.twins.get(type);
      if (!twin || twin._item?.deleted) continue;
      if (type instanceof Y.XmlText && twin instanceof Y.XmlText) syncText(type, twin);
      else if (type instanceof Y.Text && twin instanceof Y.Text) syncText(type, twin);
      else if (type instanceof Y.XmlElement && twin instanceof Y.XmlElement) {
        this.syncAttributes(type, twin);
        this.syncChildren(type, twin);
      } else if (type instanceof Y.XmlFragment && twin instanceof Y.XmlFragment)
        this.syncChildren(type, twin);
      else if (type instanceof Y.Map && twin instanceof Y.Map) {
        for (const key of new Set([...type.keys(), ...twin.keys()])) this.syncKey(type, twin, key);
      } else if (type instanceof Y.Array && twin instanceof Y.Array) this.syncArray(type, twin);
    }
  }

  private syncAttributes(real: Y.XmlElement, copy: Y.XmlElement): void {
    const want: Record<string, unknown> = real.getAttributes();
    const have: Record<string, unknown> = copy.getAttributes();
    for (const [name, value] of Object.entries(want)) {
      const next = anonymised(value);
      // Yjs types an attribute's value as a string; the live state keeps objects there.
      if (canonical(next) !== canonical(have[name])) copy.setAttribute(name, next as never);
    }
    for (const name of Object.keys(have)) if (!(name in want)) copy.removeAttribute(name);
  }

  private syncKey(real: Y.Map<unknown>, copy: Y.Map<unknown>, key: string): void {
    if (!real.has(key)) {
      if (copy.has(key)) copy.delete(key);
      return;
    }
    const value = real.get(key);
    const type = sharedOf(value);
    if (type) {
      const twin = sharedOf(copy.get(key));
      if (twin && this.owners.get(twin) === type) return;
      copy.set(key, this.cloneOf(type));
      this.linkTree(type, sharedOf(copy.get(key)));
      return;
    }
    const next = anonymised(value);
    if (!copy.has(key) || canonical(next) !== canonical(copy.get(key))) copy.set(key, next);
  }

  /** A list of children made to match: twins kept in order, what went taken out, what came cloned in. */
  private syncChildren(real: Container, copy: Container): void {
    const want = real.toArray().map(sharedOf);
    const wanted = new Set(want);
    let index = 0;
    // What went: the copy's children whose real twin is no longer a child.
    for (const child of copy.toArray()) {
      const known = sharedOf(child);
      const owner = known ? this.owners.get(known) : undefined;
      if (owner && wanted.has(owner)) index += 1;
      else copy.delete(index, 1);
    }
    // What came: each wanted child missing at its place, cloned in. Yjs never moves an item, so the twins kept are
    // in the order of their real types.
    let at = 0;
    for (const child of want) {
      if (!child) continue;
      const current = at < copy.length ? sharedOf(copy.get(at)) : null;
      if (current && this.owners.get(current) === child) {
        at += 1;
        continue;
      }
      const clone = this.cloneOf(child);
      if (clone instanceof Y.XmlElement || clone instanceof Y.XmlText) {
        copy.insert(at, [clone]);
        this.linkTree(child, sharedOf(copy.get(at)));
        at += 1;
      }
    }
  }

  private syncArray(real: Y.Array<unknown>, copy: Y.Array<unknown>): void {
    const want = real.toArray();
    if (canonical(anonymised(real.toJSON())) === canonical(copy.toJSON())) return;
    copy.delete(0, copy.length);
    copy.insert(
      0,
      want.map((v) => {
        const type = sharedOf(v);
        return type ? this.cloneOf(type) : anonymised(v);
      }),
    );
    want.forEach((v, i) => {
      const type = sharedOf(v);
      if (type) this.linkTree(type, sharedOf(copy.get(i)));
    });
  }

  /** A clone of a real type, redacted (an element's suggestion marks, a text's formatting). */
  private cloneOf(real: Shared): Shared {
    if (real instanceof Y.XmlText || real instanceof Y.Text) {
      const text = real instanceof Y.XmlText ? new Y.XmlText() : new Y.Text();
      text.applyDelta(
        runsOf(unitsOf(real)).map((u) => ({
          insert: u.insert,
          ...(u.attributes ? { attributes: u.attributes } : {}),
        })),
        { sanitize: false },
      );
      return text;
    }
    if (real instanceof Y.XmlElement) {
      const element = new Y.XmlElement(real.nodeName);
      const attributes: Record<string, unknown> = real.getAttributes();
      for (const [name, value] of Object.entries(attributes))
        element.setAttribute(name, anonymised(value) as never);
      const children = real.toArray().flatMap((c) => {
        const type = sharedOf(c);
        const clone = type ? this.cloneOf(type) : null;
        return clone instanceof Y.XmlElement || clone instanceof Y.XmlText ? [clone] : [];
      });
      element.insert(0, children);
      return element;
    }
    if (real instanceof Y.Map) {
      const map = new Y.Map<unknown>();
      for (const [key, value] of real.entries()) {
        const type = sharedOf(value);
        map.set(key, type ? this.cloneOf(type) : anonymised(value));
      }
      return map;
    }
    // A fragment is only ever a root, never cloned; an array's values cloned as a map's.
    const array = new Y.Array<unknown>();
    if (real instanceof Y.Array)
      array.insert(
        0,
        real.toArray().map((v) => {
          const type = sharedOf(v);
          return type ? this.cloneOf(type) : anonymised(v);
        }),
      );
    return array;
  }

  /** The seed's items in a fragment of the copy, linked to the same items of the real state, all the way down. */
  private linkSeed(real: Container, copy: Container, linked: Shared[]): void {
    const seeded = (type: unknown) =>
      sharedOf(type)?._item?.id.client === TEXT_DOCUMENT_SEED_CLIENT ? sharedOf(type) : null;
    const twins = real.toArray().map(seeded);
    for (const child of copy.toArray().map(seeded)) {
      const twin = twins.find((t) => t?._item?.id.clock === child?._item?.id.clock);
      if (!child || !twin || twin.constructor !== child.constructor) continue;
      this.link(twin, child);
      linked.push(twin);
      if (twin instanceof Y.XmlElement) this.linkSeed(twin, child as Y.XmlElement, linked);
    }
  }

  /**
   * A kept copy linked to the real state it was copied from, all the way down: the same kinds of type, element names
   * and children, in order. Text and values may lag (the sync brings them up); a shape that differs throws.
   */
  private linkExact(real: Shared, copy: Shared): void {
    const refuse = (): never => {
      throw new Error('viewer copy does not line up with the state');
    };
    if (real.constructor !== copy.constructor) refuse();
    this.link(real, copy);
    if (real instanceof Y.XmlElement && (copy as Y.XmlElement).nodeName !== real.nodeName) refuse();
    if (real instanceof Y.XmlFragment || real instanceof Y.Array) {
      const want: unknown[] = real.toArray();
      const have = (copy as Container | Y.Array<unknown>).toArray();
      if (want.length !== have.length) refuse();
      want.forEach((child, i) => {
        const type = sharedOf(child);
        if (!type) return;
        const twin = sharedOf(have[i]);
        if (!twin) refuse();
        this.linkExact(type, twin!);
      });
    } else if (real instanceof Y.Map) {
      for (const [key, value] of real.entries()) {
        const type = sharedOf(value);
        const twin = sharedOf((copy as Y.Map<unknown>).get(key));
        // A type the copy lacks or holds as another kind is cloned in by the sync.
        if (type && twin && twin.constructor === type.constructor) this.linkExact(type, twin);
      }
    }
  }

  /** A clone just placed, linked to its real twin all the way down. */
  private linkTree(real: Shared, copy: Shared | null): void {
    if (!copy) return;
    this.link(real, copy);
    if (
      (real instanceof Y.XmlElement || real instanceof Y.XmlFragment) &&
      (copy instanceof Y.XmlElement || copy instanceof Y.XmlFragment)
    ) {
      const twins = copy.toArray();
      real.toArray().forEach((kid, i) => {
        const type = sharedOf(kid);
        if (type) this.linkTree(type, sharedOf(twins[i]));
      });
    } else if (real instanceof Y.Map && copy instanceof Y.Map) {
      for (const [key, value] of real.entries()) {
        const type = sharedOf(value);
        if (type) this.linkTree(type, sharedOf(copy.get(key)));
      }
    } else if (real instanceof Y.Array && copy instanceof Y.Array) {
      real.toArray().forEach((value, i) => {
        const type = sharedOf(value);
        if (type) this.linkTree(type, sharedOf(copy.get(i)));
      });
    }
  }
}

/** Every type of a document but its threads, roots first. */
function everyType(doc: Y.Doc): Shared[] {
  const out: Shared[] = [];
  const walk = (type: Shared) => {
    out.push(type);
    const children =
      type instanceof Y.Map
        ? [...type.values()]
        : type instanceof Y.XmlFragment || type instanceof Y.Array
          ? type.toArray()
          : [];
    for (const child of children) {
      const shared = sharedOf(child);
      if (shared) walk(shared);
    }
  };
  for (const name of [...doc.share.keys()]) {
    if (name === THREADS_MAP) continue;
    walk(isFragmentName(name) ? doc.getXmlFragment(name) : doc.getMap<unknown>(name));
  }
  return out;
}
