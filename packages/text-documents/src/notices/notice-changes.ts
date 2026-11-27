// What changed in a text document tab during a notification window (docs/specs/034-text-documents/review.md
// "Notifications", The edits email): the writing applied since the window opened, read as version history reads a
// version (Yjs snapshots), so each change keeps who made it. A pending suggestion is never a change: on either side,
// writing inside a suggested insertion reads absent and writing inside a suggested deletion reads present, so
// accepting one is a change and rejecting one is none. Pure.
import * as Y from 'yjs';
import { EQUATION, INSERTION_MARK, PICTURE, THREADS_MAP } from '../live/live-names';
import { BODY_FRAGMENT } from '../live/live-root';
import { VersionSnapshots, type DeleteSet } from '../versions/version-snapshots';

/** Writing added or removed in the window, and whose it is: an author's key, null when no one was recorded. */
export type NoticeChange = {
  readonly kind: 'added' | 'removed';
  readonly text: string;
  readonly author: string | null;
};

/** What the tab held as the window opened, as the room keeps it. */
export type NoticeBaseline = { readonly stateVector: Uint8Array; readonly deletions: Uint8Array };

export type NoticeChangeAuthors = {
  /** The author key a Yjs client writes for; null when none was recorded. */
  readonly ofClient: (client: number) => string | null;
  /** Each author key's deletions in the window, encoded as the room keeps them (`VersionSnapshots.encodeDeletions`). */
  readonly deleters: ReadonlyMap<string, Uint8Array>;
};

/** How long one change's text is kept while reading: the email cuts it shorter. */
const CHANGE_TEXT_KEPT = 1_000;

/** An object in a line, as an email names it (default copy). */
const OBJECT_TEXT: Readonly<Record<string, string>> = {
  [PICTURE]: 'a picture',
  [EQUATION]: 'an equation',
};

type Run =
  | { readonly kind: 'added' | 'removed'; readonly text: string; readonly author: string | null }
  | { readonly kind: 'same' }
  | { readonly kind: 'break' };

/** Any shared type, as the walk reads it: its first item, deleted or not. */
type Items = { readonly _start: Y.Item | null };

/** An element, as the walk reads it: its name, and its attributes as a side read them. */
type Element = Items & {
  readonly nodeName: string;
  getAttributes(snapshot?: Y.Snapshot): Record<string, unknown>;
};

type Side = { readonly snapshot: Y.Snapshot | undefined };

type Sides = { readonly before: boolean; readonly now: boolean };

const visible = (item: Y.Item, side: Side): boolean =>
  side.snapshot === undefined
    ? !item.deleted
    : (side.snapshot.sv.get(item.id.client) ?? 0) > item.id.clock &&
      !Y.isDeleted(side.snapshot.ds, item.id);

/** An element inside a suggested insertion on that side: absent there while the suggestion is pending. */
const suggestedInsertion = (element: Element, side: Side): boolean => {
  const attributes = element.getAttributes(side.snapshot);
  return attributes[INSERTION_MARK] !== undefined && attributes[INSERTION_MARK] !== null;
};

class ChangeReader {
  private readonly runs: Run[] = [];
  private readonly before: Side;
  private readonly now: Side = { snapshot: undefined };
  private readonly ofClient: (client: number) => string | null;
  private readonly deleters: readonly (readonly [string, DeleteSet])[];

  constructor(baseline: Y.Snapshot, authors: NoticeChangeAuthors) {
    this.before = { snapshot: baseline };
    this.ofClient = authors.ofClient;
    this.deleters = [...authors.deleters].map(([key, bytes]) => [
      key,
      VersionSnapshots.decodeDeletions(bytes),
    ]);
  }

  private deleterOf(id: Y.ID): string | null {
    for (const [key, ds] of this.deleters) if (Y.isDeleted(ds, id)) return key;
    return null;
  }

  private push(present: Sides, item: Y.Item, text: string): void {
    if (present.before === present.now) {
      this.runs.push({ kind: 'same' });
      return;
    }
    const kind = present.now ? 'added' : 'removed';
    const author = present.now ? this.ofClient(item.id.client) : this.deleterOf(item.id);
    this.runs.push({ kind, text, author });
  }

  /** A part of the tab (its body, a header, a note): a change never runs from one part into the next. */
  part(root: Items): void {
    this.runs.push({ kind: 'same' });
    this.walk(root, { before: true, now: true });
  }

  /** A list-like type's items, deleted ones too, each read on both sides within its parent's presence. */
  private walk(type: Items, parent: Sides): void {
    const formats = { before: new Map<string, unknown>(), now: new Map<string, unknown>() };
    for (let n = type._start; n !== null; n = n.right) {
      const content = n.content;
      if (content instanceof Y.ContentFormat) {
        for (const side of ['before', 'now'] as const)
          if (visible(n, this[side]))
            if (content.value === null) formats[side].delete(content.key);
            else formats[side].set(content.key, content.value);
        continue;
      }
      const present: Sides = {
        before: parent.before && visible(n, this.before) && !formats.before.has(INSERTION_MARK),
        now: parent.now && visible(n, this.now) && !formats.now.has(INSERTION_MARK),
      };
      if (content instanceof Y.ContentString) this.push(present, n, content.str);
      else if (content instanceof Y.ContentType) this.element(content.type, n, present);
    }
  }

  private element(type: Items, item: Y.Item, present: Sides): void {
    if (type instanceof Y.XmlElement) this.block(type as Element, item, present);
    else this.walk(type, present);
  }

  /** An element: an object in a line names itself; a block breaks the writing and holds more. */
  private block(type: Element, item: Y.Item, present: Sides): void {
    const inside: Sides = {
      before: present.before && !suggestedInsertion(type, this.before),
      now: present.now && !suggestedInsertion(type, this.now),
    };
    const object = OBJECT_TEXT[type.nodeName];
    if (object) {
      this.push(inside, item, object);
      return;
    }
    this.runs.push({ kind: 'break' });
    this.walk(type, inside);
  }

  /** The runs folded into changes: adjacent runs of one kind and author join, across blocks with a space. */
  changes(): NoticeChange[] {
    const out: { kind: 'added' | 'removed'; text: string; author: string | null }[] = [];
    let open: (typeof out)[number] | null = null;
    let broken = false;
    for (const run of this.runs) {
      if (run.kind === 'same') {
        open = null;
        continue;
      }
      if (run.kind === 'break') {
        broken = true;
        continue;
      }
      if (open && open.kind === run.kind && open.author === run.author) {
        if (open.text.length < CHANGE_TEXT_KEPT)
          open.text = (open.text + (broken ? ' ' : '') + run.text).slice(0, CHANGE_TEXT_KEPT);
      } else {
        open = { kind: run.kind, text: run.text.slice(0, CHANGE_TEXT_KEPT), author: run.author };
        out.push(open);
      }
      broken = false;
    }
    return out
      .map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }))
      .filter((c) => c.text !== '');
  }
}

/** The roots of a tab's state, the body first, the threads left out: comments are never an edit. */
function writingRoots(doc: Y.Doc): Items[] {
  return [...doc.share.keys()]
    .filter((name) => name !== THREADS_MAP)
    .sort((a, b) => (a === BODY_FRAGMENT ? -1 : b === BODY_FRAGMENT ? 1 : a.localeCompare(b)))
    .map((name) => doc.share.get(name)!);
}

export const NoticeChanges = {
  /** The writing applied in `doc` since `baseline`, in place order. `doc` must keep deleted items (`gc: false`). */
  since: (doc: Y.Doc, baseline: NoticeBaseline, authors: NoticeChangeAuthors): NoticeChange[] => {
    const snapshot = Y.createSnapshot(
      VersionSnapshots.decodeDeletions(baseline.deletions),
      Y.decodeStateVector(baseline.stateVector),
    );
    const reader = new ChangeReader(snapshot, authors);
    for (const root of writingRoots(doc)) reader.part(root);
    return reader.changes();
  },
} as const;
