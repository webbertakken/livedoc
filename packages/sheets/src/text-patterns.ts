// Smart Fill's text patterns (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D149): an output text built
// from one row's source texts, learnt from examples. A pattern joins pieces: fixed text, or a **take** of one source
// (its whole text, first letter, a word counted from either end, the first letter of a word, or what lies before or
// after the first or last mark), each as is or in lower, upper or title case. The pattern with the fewest pieces that
// gives every example wins, takes tried before fixed characters.

/** The marks a text is split at, a space first. */
export const TEXT_PATTERN_MARKS = [' ', ',', '.', '@', '-', '_', '/', ';', ':'] as const;
/** How many words a take counts from each end. */
export const TEXT_PATTERN_WORDS_MAX = 6;
/** The most search states one learning visits before it gives up (an example's few hundred characters fit). */
export const TEXT_PATTERN_SEARCH_MAX = 20_000;
/** How many examples the search walks together; the rest are checked against what it finds. */
export const TEXT_PATTERN_EXAMPLES_SEARCHED = 4;

const CASES = ['same', 'lower', 'upper', 'title'] as const;

// `at`: a word's index (negative from the end), or for before/after 0 the first mark and -1 the last.
export type TextTake = {
  src: number;
  kind: 'whole' | 'first' | 'word' | 'initial' | 'before' | 'after';
  mark: string;
  at: number;
  case: (typeof CASES)[number];
};

export type TextPiece = { k: 'text'; text: string } | { k: 'take'; take: TextTake };
export type TextPattern = readonly TextPiece[];
export type TextExample = { sources: readonly string[]; output: string };

function words(text: string, mark: string): string[] {
  return mark === ' ' ? text.trim().split(/\s+/) : text.split(mark);
}

function wordAt(list: string[], at: number): string | undefined {
  return at < 0 ? list[list.length + at] : list[at];
}

function cased(text: string, c: TextTake['case']): string {
  if (c === 'lower') return text.toLowerCase();
  if (c === 'upper') return text.toUpperCase();
  if (c === 'title')
    return text
      .toLowerCase()
      .replace(/(^|\s)(\S)/g, (_, gap: string, ch: string) => gap + ch.toUpperCase());
  return text;
}

function raw(take: TextTake, text: string): string | undefined {
  const { kind, mark, at } = take;
  if (kind === 'whole') return text;
  if (kind === 'first') return text[0];
  if (kind === 'word' || kind === 'initial') {
    const list = words(text, mark);
    // A word needs the mark: without it the "word" is the whole text, which `whole` takes.
    if (list.length < 2) return undefined;
    const word = wordAt(list, at);
    return kind === 'word' ? word : word?.[0];
  }
  const i = at === 0 ? text.indexOf(mark) : text.lastIndexOf(mark);
  if (i < 0) return undefined;
  return kind === 'before' ? text.slice(0, i) : text.slice(i + mark.length);
}

/** What a take gives of one source text; null when the text lacks it (no such word or mark, or nothing). */
export function takeText(take: TextTake, text: string): string | null {
  const got = raw(take, text);
  return got ? cased(got, take.case) : null;
}

// Every take of one source, in the order the search prefers them.
function takesOf(src: number): TextTake[] {
  const shapes: Omit<TextTake, 'case'>[] = [
    { src, kind: 'whole', mark: '', at: 0 },
    { src, kind: 'first', mark: '', at: 0 },
  ];
  for (const mark of TEXT_PATTERN_MARKS) {
    for (let i = 0; i < TEXT_PATTERN_WORDS_MAX; i++) {
      shapes.push({ src, kind: 'word', mark, at: i }, { src, kind: 'word', mark, at: -1 - i });
      if (mark === ' ')
        shapes.push(
          { src, kind: 'initial', mark, at: i },
          { src, kind: 'initial', mark, at: -1 - i },
        );
    }
    for (const at of [0, -1])
      shapes.push({ src, kind: 'before', mark, at }, { src, kind: 'after', mark, at });
  }
  return shapes.flatMap((s) => CASES.map((c) => ({ ...s, case: c })));
}

/** A pattern's text for one row's sources; null when a take finds nothing there. */
export function runTextPattern(pattern: TextPattern, sources: readonly string[]): string | null {
  let out = '';
  for (const piece of pattern) {
    if (piece.k === 'text') out += piece.text;
    else {
      const got = takeText(piece.take, sources[piece.take.src] ?? '');
      if (got === null) return null;
      out += got;
    }
  }
  return out;
}

// A search state: each searched example's position, and whether the last piece was fixed text (whose next
// character extends it at no cost). `cost` counts pieces.
type Node = { at: number[]; text: boolean };
type Step = { cost: number; from: string | null; piece: TextPiece | null; done: boolean };

const keyOf = (n: Node) => `${n.at.join(',')}${n.text ? 't' : ''}`;

/** The simplest pattern giving every example's output from its sources, or null (none, or past `budget` states). */
export function learnTextPattern(
  examples: readonly TextExample[],
  budget = TEXT_PATTERN_SEARCH_MAX,
): TextPattern | null {
  const searched = examples.slice(0, TEXT_PATTERN_EXAMPLES_SEARCHED);
  const first = searched[0];
  if (!first) return null;
  const outs = searched.map((e) => e.output);
  // The takes that give every searched example something, with what they give.
  const takes = first.sources
    .flatMap((_, src) => takesOf(src))
    .map((take) => ({
      take,
      texts: searched.map((e) => takeText(take, e.sources[take.src] ?? '')),
    }))
    .filter((t) => t.texts.every((x) => x !== null));
  const start: Node = { at: outs.map(() => 0), text: false };
  const steps = new Map<string, Step>([
    [keyOf(start), { cost: 0, from: null, piece: null, done: false }],
  ]);
  // A 0-1 search: a piece costs one, a character added to fixed text nothing; ties keep the first found.
  const deque: Node[] = [start];
  let visited = 0;
  while (deque.length) {
    const node = deque.shift()!;
    const key = keyOf(node);
    const step = steps.get(key)!;
    if (step.done) continue;
    step.done = true;
    if (++visited > budget) return null;
    if (node.at.every((p, k) => p === outs[k]!.length)) {
      const pattern = rebuild(steps, key);
      return examples.every((e) => runTextPattern(pattern, e.sources) === e.output)
        ? pattern
        : null;
    }
    const visit = (next: Node, piece: TextPiece, free: boolean) => {
      const nextKey = keyOf(next);
      const cost = step.cost + (free ? 0 : 1);
      const had = steps.get(nextKey);
      if (had && had.cost <= cost) return;
      steps.set(nextKey, { cost, from: key, piece, done: false });
      if (free) deque.unshift(next);
      else deque.push(next);
    };
    for (const t of takes)
      if (t.texts.every((x, k) => outs[k]!.startsWith(x as string, node.at[k])))
        visit(
          { at: node.at.map((p, k) => p + t.texts[k]!.length), text: false },
          { k: 'take', take: t.take },
          false,
        );
    const ch = outs[0]![node.at[0]!];
    if (ch !== undefined && outs.every((o, k) => o[node.at[k]!] === ch))
      visit({ at: node.at.map((p) => p + 1), text: true }, { k: 'text', text: ch }, node.text);
  }
  return null;
}

// The pieces on the way to `key`, adjacent characters joined into one fixed text.
function rebuild(steps: Map<string, Step>, key: string): TextPattern {
  const pieces: TextPiece[] = [];
  for (let step = steps.get(key)!; step.piece; step = steps.get(step.from!)!)
    pieces.unshift(step.piece);
  const out: TextPiece[] = [];
  for (const piece of pieces) {
    const last = out[out.length - 1];
    if (piece.k === 'text' && last?.k === 'text')
      out[out.length - 1] = { k: 'text', text: last.text + piece.text };
    else out.push(piece);
  }
  return out;
}
