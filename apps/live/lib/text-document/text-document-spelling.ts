// Spelling in a text document's writing (docs/specs/034-text-documents/tools.md "Spelling and grammar"): LiveDoc's own
// wavy underline under each misspelt word where a dictionary ships, the browser's own check everywhere else, never
// both. The check runs off the page's thread; a keystroke only maps the underlines and notes what changed, and the
// changed paragraphs are read again once typing pauses.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { PersonalDictionary } from '@/lib/spelling/personal-dictionary';
import type { SpellingChecker } from '@/lib/spelling/spelling-checker';
import { spellingLanguageFor, type SpellingLanguage } from '@/lib/spelling/spelling-languages';
import { checkableWords } from '@/lib/spelling/spelling-words';

/** How long typing pauses before the changed paragraphs are checked (safe 150..1,000 ms). */
export const SPELLING_IDLE_MS = 400;
export const MISSPELT_CLASS = 'text-document-misspelt';

export type SpellingSource = {
  checker: SpellingChecker;
  /** The document's language tag (File > Language, else the browser's). */
  language: () => string;
  /** A run's own language where it carries one, else null (the document's). */
  runLanguage?: (text: PmNode) => string | null;
  personal: () => PersonalDictionary;
  /** Whether misspellings show: Show spelling suggestions on, and the text can be changed. */
  shown: () => boolean;
  /** Whether a paragraph is never checked (a code block). */
  skipped?: (block: PmNode) => boolean;
  /** Told what each read found, after it is shown (the context menu fetches their suggestions ahead). */
  onFound?: (misspelt: readonly Misspelling[]) => void;
};

type Range = { readonly from: number; readonly to: number };
export type Misspelling = Range & { readonly word: string; readonly language: SpellingLanguage };

type SpellingState = {
  readonly decorations: DecorationSet;
  /** Words set aside with Ignore, until the document is closed. */
  readonly ignored: ReadonlySet<string>;
  /** What changed since it was last read. */
  readonly dirty: readonly Range[];
  /** The changes since the running scan began, to place what it finds. */
  readonly since: Mapping;
  /** The word ending at the caret as it was typed: underlined only once the caret leaves it. */
  readonly held: Range | null;
};

type SpellingMeta =
  | { kind: 'rescan' }
  | { kind: 'scan-started' }
  | {
      kind: 'found';
      blocks: readonly Range[];
      misspelt: readonly Misspelling[];
      held: Range | null;
    }
  | { kind: 'ignore'; word: string };

export const spellingKey = new PluginKey<SpellingState>('text-document-spelling');

const misspeltDecoration = (m: Misspelling) =>
  Decoration.inline(
    m.from,
    m.to,
    { class: MISSPELT_CLASS, 'data-misspelt': m.word },
    { word: m.word, language: m.language },
  );

/** What a transaction changed, as ranges of the document after it. */
function changedRanges(tr: Transaction): Range[] {
  const ranges: Range[] = [];
  tr.mapping.maps.forEach((map, i) => {
    const after = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: after.map(newStart, -1), to: after.map(newEnd, 1) });
    });
  });
  return ranges;
}

const mapRange = (mapping: Mapping, r: Range): Range | null => {
  const from = mapping.mapResult(r.from, 1);
  const to = mapping.mapResult(r.to, -1);
  return from.deleted && to.deleted
    ? null
    : to.pos > from.pos
      ? { from: from.pos, to: to.pos }
      : null;
};

/** The textblocks touching any of `ranges`, each once, in order. */
function blocksTouching(doc: PmNode, ranges: readonly Range[]): { node: PmNode; pos: number }[] {
  const found = new Map<number, PmNode>();
  for (const { from, to } of ranges) {
    const a = Math.max(0, Math.min(from, doc.content.size));
    const b = Math.max(a, Math.min(to, doc.content.size));
    doc.nodesBetween(a, b, (node, pos) => {
      if (node.isTextblock) {
        found.set(pos, node);
        return false;
      }
      return true;
    });
    // A caret range between blocks touches the block it sits in.
    if (a === b) {
      const $a = doc.resolve(a);
      if ($a.parent.isTextblock) found.set($a.before(), $a.parent);
    }
  }
  return [...found.entries()].sort(([x], [y]) => x - y).map(([pos, node]) => ({ node, pos }));
}

type Candidate = Range & { word: string; language: SpellingLanguage };

/** The checked words of one paragraph, each with the dictionary its run's language takes. */
function blockCandidates(
  block: PmNode,
  pos: number,
  source: SpellingSource,
  documentLanguage: string,
): Candidate[] {
  const out: Candidate[] = [];
  let run: { text: string; starts: number[]; tag: string } | null = null;
  const flush = () => {
    if (!run) return;
    const language = spellingLanguageFor(run.tag);
    if (language) {
      const { starts } = run;
      for (const w of checkableWords(run.text))
        out.push({ from: starts[w.from]!, to: starts[w.to - 1]! + 1, word: w.word, language });
    }
    run = null;
  };
  block.forEach((child, offset) => {
    if (!child.isText) {
      flush();
      return;
    }
    const tag = source.runLanguage?.(child) ?? documentLanguage;
    if (run && run.tag !== tag) flush();
    run ??= { text: '', starts: [], tag };
    const at = pos + 1 + offset;
    for (let i = 0; i < child.text!.length; i++) run.starts.push(at + i);
    run.text += child.text;
  });
  flush();
  return out;
}

/** Reads `blocks` and finds their misspellings: personal and ignored words never, the word being typed not yet. */
export async function scanBlocks(
  state: EditorState,
  blocks: readonly { node: PmNode; pos: number }[],
  source: SpellingSource,
): Promise<{ misspelt: Misspelling[]; held: Range | null }> {
  const personal = source.personal();
  const ignored = spellingKey.getState(state)?.ignored ?? new Set<string>();
  const documentLanguage = source.language();
  const { selection } = state;
  let held: Range | null = null;
  const byLanguage = new Map<SpellingLanguage, Candidate[]>();
  for (const { node, pos } of blocks) {
    if (source.skipped?.(node)) continue;
    for (const c of blockCandidates(node, pos, source, documentLanguage)) {
      if (PersonalDictionary.has(personal, c.word) || ignored.has(c.word)) continue;
      if (selection.empty && c.to === selection.from && wasJustTyped(state, c)) {
        held = { from: c.from, to: c.to };
        continue;
      }
      const list = byLanguage.get(c.language) ?? [];
      list.push(c);
      byLanguage.set(c.language, list);
    }
  }
  const misspelt: Misspelling[] = [];
  for (const [language, candidates] of byLanguage) {
    const wrong = await source.checker.check(
      language,
      candidates.map((c) => c.word),
    );
    for (const c of candidates) if (wrong.has(c.word)) misspelt.push(c);
  }
  return { misspelt: misspelt.sort((a, b) => a.from - b.from), held };
}

// The word at the caret is being typed while what changed last touches it.
const wasJustTyped = (state: EditorState, word: Range): boolean =>
  (spellingKey.getState(state)?.dirty ?? []).some((r) => r.to >= word.from && r.from <= word.to);

function applyFound(
  value: SpellingState,
  meta: Extract<SpellingMeta, { kind: 'found' }>,
  doc: PmNode,
): SpellingState {
  let decorations = value.decorations;
  for (const block of meta.blocks) {
    const mapped = mapRange(value.since, block);
    if (mapped) decorations = decorations.remove(decorations.find(mapped.from, mapped.to));
  }
  const added: Decoration[] = [];
  for (const m of meta.misspelt) {
    const mapped = mapRange(value.since, m);
    // A word changed while it was being read is read again with its paragraph.
    if (mapped && doc.textBetween(mapped.from, mapped.to) === m.word)
      added.push(misspeltDecoration({ ...m, ...mapped }));
  }
  const held = meta.held ? mapRange(value.since, meta.held) : null;
  return { ...value, decorations: decorations.add(doc, added), held };
}

function applyMeta(value: SpellingState, meta: SpellingMeta, doc: PmNode): SpellingState {
  switch (meta.kind) {
    case 'rescan':
      return {
        ...value,
        decorations: DecorationSet.empty,
        dirty: [{ from: 0, to: doc.content.size }],
      };
    case 'scan-started':
      return { ...value, dirty: [], since: new Mapping() };
    case 'found':
      return applyFound(value, meta, doc);
    case 'ignore': {
      const ignored = new Set(value.ignored).add(meta.word);
      const gone = value.decorations.find(
        undefined,
        undefined,
        (spec: { word?: unknown }) => spec.word === meta.word,
      );
      return { ...value, ignored, decorations: value.decorations.remove(gone) };
    }
  }
}

function applyChange(value: SpellingState, tr: Transaction): SpellingState {
  const changed = changedRanges(tr);
  const mapped = value.decorations.map(tr.mapping, tr.doc);
  // An underline the change touches goes at once; its paragraph is read again when typing pauses.
  const touched = changed.flatMap((r) => mapped.find(r.from, r.to));
  const dirty = [
    ...value.dirty.map(
      (r) =>
        mapRange(tr.mapping, r) ?? { from: tr.mapping.map(r.from), to: tr.mapping.map(r.from) },
    ),
    ...changed,
  ];
  const since = new Mapping([...value.since.maps, ...tr.mapping.maps]);
  return { ...value, decorations: mapped.remove(touched), dirty, since, held: null };
}

/** The decorations a run in another language needs for the browser's check: its own `spellcheck`. */
function browserCheckDecorations(state: EditorState, source: SpellingSource): Decoration[] {
  if (!source.runLanguage) return [];
  const documentChecked = browserChecks(source.language(), source);
  const out: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const tag = source.runLanguage!(node);
    if (tag === null) return false;
    const checked = browserChecks(tag, source);
    if (checked !== documentChecked)
      out.push(Decoration.inline(pos, pos + node.nodeSize, { spellcheck: String(checked) }));
    return false;
  });
  return out;
}

/** Whether the browser's own check runs on text in `tag`: only where LiveDoc ships no dictionary for it. */
const browserChecks = (tag: string, source: SpellingSource): boolean =>
  source.shown() && spellingLanguageFor(tag) === null;

/** The plugin: LiveDoc's underlines, the browser's check where LiveDoc has none, the reads when typing pauses. */
export function spellingPlugin(source: SpellingSource): Plugin<SpellingState> {
  return new Plugin<SpellingState>({
    key: spellingKey,
    state: {
      init: (_, state) => ({
        decorations: DecorationSet.empty,
        ignored: new Set(),
        dirty: [{ from: 0, to: state.doc.content.size }],
        since: new Mapping(),
        held: null,
      }),
      apply: (tr, value, _old, state) => {
        let next = tr.docChanged ? applyChange(value, tr) : value;
        const meta = tr.getMeta(spellingKey) as SpellingMeta | undefined;
        if (meta) next = applyMeta(next, meta, state.doc);
        // The caret left the word being typed: its paragraph is read again.
        if (!tr.docChanged && tr.selectionSet && next.held) {
          const { from, to } = next.held;
          const caret = state.selection.from;
          if (caret < from || caret > to)
            next = { ...next, dirty: [...next.dirty, next.held], held: null };
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        if (!source.shown()) return DecorationSet.empty;
        const own = spellingKey.getState(state)!.decorations;
        const browser = browserCheckDecorations(state, source);
        return browser.length > 0 ? own.add(state.doc, browser) : own;
      },
      attributes: () => ({ spellcheck: String(browserChecks(source.language(), source)) }),
    },
    view: (view) => spellingScanner(view, source),
  });
}

// Reads what changed once typing pauses, one read at a time.
function spellingScanner(view: EditorView, source: SpellingSource) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let destroyed = false;

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void scanNow(), SPELLING_IDLE_MS);
  };

  // The read itself: `scan-started` empties what is dirty and starts mapping the changes made while the worker reads;
  // the result is placed through them.
  const scanNow = async () => {
    timer = null;
    if (running || destroyed) return;
    const value = spellingKey.getState(view.state);
    if (!value || value.dirty.length === 0 || !source.shown()) return;
    running = true;
    const blocks = blocksTouching(view.state.doc, value.dirty);
    const reading = view.state;
    view.dispatch(
      view.state.tr.setMeta(spellingKey, { kind: 'scan-started' } satisfies SpellingMeta),
    );
    const started = performance.now();
    try {
      const found = await scanBlocks(reading, blocks, source);
      if (destroyed) return;
      view.dispatch(
        view.state.tr.setMeta(spellingKey, {
          kind: 'found',
          blocks: blocks.map(({ node, pos }) => ({ from: pos, to: pos + node.nodeSize })),
          ...found,
        } satisfies SpellingMeta),
      );
      debugLog('[spelling] read', {
        paragraphs: blocks.length,
        misspelt: found.misspelt.length,
        ms: Math.round(performance.now() - started),
      });
      source.onFound?.(found.misspelt);
    } finally {
      running = false;
    }
    if (!destroyed && (spellingKey.getState(view.state)?.dirty.length ?? 0) > 0) schedule();
  };

  schedule();
  return {
    update: (v: EditorView, prev: EditorState) => {
      const before = spellingKey.getState(prev);
      const after = spellingKey.getState(v.state);
      if (after && after !== before && after.dirty.length > 0 && after.dirty !== before?.dirty)
        schedule();
    },
    destroy: () => {
      destroyed = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}

/** Reads every paragraph again: the language, the personal dictionary or whether misspellings show changed. */
export const rescanSpelling = (view: EditorView): void => {
  view.dispatch(view.state.tr.setMeta(spellingKey, { kind: 'rescan' } satisfies SpellingMeta));
};

/** Sets `word` aside in this document until it is closed. */
export const ignoreMisspelling = (view: EditorView, word: string): void => {
  view.dispatch(
    view.state.tr.setMeta(spellingKey, { kind: 'ignore', word } satisfies SpellingMeta),
  );
};

/** The misspelling at `pos`, if any. */
export function misspellingAt(state: EditorState, pos: number): Misspelling | null {
  const value = spellingKey.getState(state);
  const found = value?.decorations.find(
    pos,
    pos,
    (spec: { word?: unknown }) => typeof spec.word === 'string',
  )[0];
  if (!found) return null;
  const spec = found.spec as { word: string; language: SpellingLanguage };
  return { from: found.from, to: found.to, word: spec.word, language: spec.language };
}
