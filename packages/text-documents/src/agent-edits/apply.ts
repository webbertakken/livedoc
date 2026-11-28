// A text document changeset applied (docs/specs/024-agents/agent-changesets.md "A text document's changesets";
// docs/specs/034-text-documents/agents-and-sync.md "Writing"): every operation in order, each against the writing the
// ones before it left, in one transaction by a client of its own on the state as it stands. One refusal refuses the
// changeset and nothing is answered to write; otherwise the update to send the room, a result line per operation, and
// the undo step a revert needs.
import * as Y from 'yjs';
import { liveBlockNodes, runAttributes } from '../live/live-write';
import { tabFragment } from '../live/live-root';
import { liveTabList } from '../live/live-tabs';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  LINK_MARK,
  SUGGESTION_MARKS,
  TEXT_PROPERTY_MARK_OF,
} from '../live/live-names';
import {
  LiveThreads,
  TEXT_DOCUMENT_COMMENT_TEXT_MAX,
  type TextDocumentCommentAuthor,
} from '../live/live-threads';
import type { Block } from '../model/blocks';
import { ParagraphRefs } from '../model/paragraph-refs';
import { Styles, STYLE_ROLES, type Style } from '../model/styles';
import { Suggestions, type FileSuggestionMark } from '../model/suggestions';
import type { TextDocumentFormat } from '../model/text-document';
import { isSafeLink } from '../report';
import { TextDocumentState } from '../text-document-state';
import { UndoSteps, type UndoStep } from '../versions/undo-step';
import { VersionSnapshots } from '../versions/version-snapshots';
import { runText, TabParagraphs, type TextPlace } from './locate';
import { markdownBlocks, markdownRuns } from './markdown-in';
import { applyTableAction, tableOfParagraph } from './table-ops';
import type { TextMark, TextOp, TextOpLine, TextOpRejection } from './text-ops';

/** The origin of an agent's transaction, so an editor's own undo never takes it. */
export const AGENT_TEXT_ORIGIN = 'agent-text-changeset';

export type TextChangesetInput = {
  /** The state's updates as stored. */
  readonly state: readonly Uint8Array[];
  readonly format: TextDocumentFormat;
  /** The document tab, by id or name (any case); the first when none. */
  readonly documentTab?: string;
  readonly ops: readonly TextOpLine[];
  /** The token's owner, the author of its comments and suggestions. */
  readonly author: TextDocumentCommentAuthor & { readonly key: string };
  /** The state vector the agent read (`X-State-Vector`), which a `replace` must match. */
  readonly base?: Uint8Array;
  readonly now: number;
  /** A new id: a thread's, a comment's, a suggestion's, a list's. */
  readonly newId: () => string;
};

export type TextChangesetApplied = {
  readonly ok: true;
  /** The document tab's id. */
  readonly documentTab: string;
  readonly results: readonly string[];
  /** The update to send the room; null when the operations changed nothing. */
  readonly update: Uint8Array | null;
  readonly step: UndoStep;
  /** The threads it began, to be resolved on revert. */
  readonly threads: readonly string[];
};

export type TextChangesetRefused = { readonly ok: false } & TextOpRejection;

type Refused = { refused: Omit<TextOpRejection, 'line' | 'operation'> };
type Outcome = string | Refused;

const refused = (error: TextOpRejection['error'], message: string): Refused => ({
  refused: { error, message },
});

type Context = {
  readonly doc: Y.Doc;
  readonly format: TextDocumentFormat;
  readonly tab: string;
  readonly fragment: Y.XmlFragment;
  readonly author: TextDocumentCommentAuthor & { readonly key: string };
  readonly now: number;
  readonly newId: () => string;
  readonly threads: string[];
};

/** Each stretch of `run` from `offset` for `length`, with its attributes. */
function stretches(
  run: Y.XmlText,
  offset: number,
  length: number,
): { from: number; length: number; attributes: Record<string, unknown> }[] {
  const out: { from: number; length: number; attributes: Record<string, unknown> }[] = [];
  let at = 0;
  for (const op of run.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    const size = typeof op.insert === 'string' ? op.insert.length : 1;
    const from = Math.max(at, offset);
    const to = Math.min(at + size, offset + length);
    if (from < to) out.push({ from, length: to - from, attributes: op.attributes ?? {} });
    at += size;
  }
  return out;
}

const suggestionMark = (ctx: Context) => ({
  id: ctx.newId(),
  at: ctx.now,
  author: { ...ctx.author },
});

/** The model's mark of a suggestion, as blocks carry it. */
const fileMark = (mark: ReturnType<typeof suggestionMark>): FileSuggestionMark => ({
  id: mark.id,
  at: mark.at,
  author: { key: mark.author.key, name: mark.author.name, colour: mark.author.colour },
});

const textOf = (place: TextPlace, length: number) =>
  runText(place.run).slice(place.offset, place.offset + length);

function edit(ctx: Context, op: Extract<TextOp, { op: 'edit' }>, suggest: boolean): Outcome {
  const found = TabParagraphs.of(ctx.fragment).find(op.old);
  if ('refused' in found) return found;
  const { run, offset } = found;
  // The new text takes the formatting of the text it replaces, a suggestion's marks left out.
  const base = { ...stretches(run, offset, 1)[0]!.attributes };
  for (const mark of SUGGESTION_MARKS) delete base[mark];
  const mark = suggest ? suggestionMark(ctx) : null;
  let at = offset;
  if (mark) {
    run.format(offset, op.old.length, { [DELETION_MARK]: mark });
    at += op.old.length;
  } else run.delete(offset, op.old.length);
  for (const r of markdownRuns(op.text)) {
    const attributes = {
      ...base,
      ...runAttributes(r),
      ...(mark ? { [INSERTION_MARK]: mark } : {}),
    };
    run.insert(at, r.text, attributes);
    at += r.text.length;
  }
  return mark
    ? `suggested ${ParagraphRefs.text(found.n)} ${mark.id}`
    : `edited ${ParagraphRefs.text(found.n)}`;
}

/** The blocks of an insertion, marked as one suggestion when suggested. */
function inserted(
  ctx: Context,
  markdown: string,
  suggest: boolean,
): { blocks: Block[]; mark: string | null } {
  const blocks = markdownBlocks(markdown, {
    doc: ctx.doc,
    format: ctx.format,
    newId: ctx.newId,
    origin: AGENT_TEXT_ORIGIN,
  });
  if (!suggest) return { blocks, mark: null };
  const mark = fileMark(suggestionMark(ctx));
  return {
    mark: mark.id,
    blocks: Suggestions.overlaid(blocks, 'insertion', mark).map((block) =>
      block.type === 'paragraph'
        ? { ...block, suggested: { break: mark } }
        : block.type === 'table'
          ? { ...block, suggested: { insertion: mark } }
          : block,
    ),
  };
}

/** Inserts the blocks into `parent` at `index`; the range of paragraph numbers they hold. */
function insertBlocks(
  ctx: Context,
  parent: Y.XmlFragment | Y.XmlElement,
  index: number,
  blocks: Block[],
): string {
  const nodes = liveBlockNodes(ctx.doc, blocks);
  parent.insert(index, nodes);
  const inserted = new Set<unknown>(nodes);
  const within = (p: Y.XmlElement) => {
    for (
      let node: { parent: unknown } | null = p;
      node;
      node = node.parent as { parent: unknown } | null
    )
      if (inserted.has(node)) return true;
    return false;
  };
  const numbers = TabParagraphs.of(ctx.fragment)
    .list.map((p, i) => (within(p) ? i + 1 : 0))
    .filter((n) => n > 0);
  const first = numbers[0] ?? 0;
  const last = numbers.at(-1) ?? 0;
  return first === last
    ? ParagraphRefs.text(first)
    : `${ParagraphRefs.text(first)}..${ParagraphRefs.text(last)}`;
}

function insert(ctx: Context, op: Extract<TextOp, { op: 'insert' }>, suggest: boolean): Outcome {
  const found = TabParagraphs.of(ctx.fragment).paragraph(op.target);
  if ('refused' in found) return found;
  const parent = found.paragraph.parent as Y.XmlFragment | Y.XmlElement;
  const index = parent.toArray().indexOf(found.paragraph) + (op.where === 'after' ? 1 : 0);
  const { blocks, mark } = inserted(ctx, op.markdown, suggest);
  const range = insertBlocks(ctx, parent, index, blocks);
  return mark ? `suggested ${range} ${mark}` : `inserted ${range}`;
}

function appendOrPrepend(
  ctx: Context,
  op: Extract<TextOp, { op: 'append' | 'prepend' }>,
  suggest: boolean,
): Outcome {
  const { blocks, mark } = inserted(ctx, op.markdown, suggest);
  const range = insertBlocks(
    ctx,
    ctx.fragment,
    op.op === 'append' ? ctx.fragment.length : 0,
    blocks,
  );
  return mark
    ? `suggested ${range} ${mark}`
    : `${op.op === 'append' ? 'appended' : 'prepended'} ${range}`;
}

/** A paragraph style by its name, then its name in any case, then a role's id. */
function styleNamed(styles: readonly Style[], name: string): Style | undefined {
  const paragraphs = styles.filter((s) => s.family === 'paragraph');
  const lower = name.toLowerCase();
  const role = STYLE_ROLES.find((r) => r === lower);
  return (
    paragraphs.find((s) => s.name === name) ??
    paragraphs.find((s) => s.name.toLowerCase() === lower) ??
    (role ? Styles.byId(styles, Styles.idOfRole(styles, role)) : undefined)
  );
}

function style(ctx: Context, op: Extract<TextOp, { op: 'style' }>): Outcome {
  const found = TabParagraphs.of(ctx.fragment).paragraph(op.target);
  if ('refused' in found) return found;
  const styles = TextDocumentState.styles(ctx.doc, ctx.format);
  const chosen = styleNamed(styles, op.style);
  if (!chosen) {
    const names = styles.filter((s) => s.family === 'paragraph').map((s) => JSON.stringify(s.name));
    return refused(
      'ref_not_found',
      `no paragraph style ${JSON.stringify(op.style)}: the document has ${names.join(', ')}, or a role: ${STYLE_ROLES.join(', ')}`,
    );
  }
  found.paragraph.setAttribute('style', chosen.id);
  return `styled ${ParagraphRefs.text(found.n)} ${JSON.stringify(chosen.name)}`;
}

/** A format operation's marks as the live attributes they set; null takes one off. */
function markAttributes(marks: readonly TextMark[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of marks)
    if (m.mark === 'link') out[LINK_MARK] = m.href === null ? null : { href: m.href };
    else out[TEXT_PROPERTY_MARK_OF[m.mark]] = m.on ? { value: true } : null;
  return out;
}

const markWords = (marks: readonly TextMark[]): string =>
  marks
    .map((m) =>
      m.mark === 'link'
        ? m.href === null
          ? '-link'
          : `link=${m.href}`
        : `${m.on ? '' : '-'}${m.mark}`,
    )
    .join(' ');

function format(ctx: Context, op: Extract<TextOp, { op: 'format' }>, suggest: boolean): Outcome {
  const unsafe = op.marks.find((m) => m.mark === 'link' && m.href !== null && !isSafeLink(m.href));
  if (unsafe) return refused('invalid_operation', 'link=<url>: an http, https or mailto address');
  const found = TabParagraphs.of(ctx.fragment).find(op.old);
  if ('refused' in found) return found;
  const attributes = markAttributes(op.marks);
  if (!suggest) {
    found.run.format(found.offset, op.old.length, attributes);
    return `formatted ${ParagraphRefs.text(found.n)} ${markWords(op.marks)}`;
  }
  const mark = suggestionMark(ctx);
  for (const stretch of stretches(found.run, found.offset, op.old.length)) {
    const before: Record<string, unknown> = {};
    for (const name of Object.keys(attributes)) before[name] = stretch.attributes[name] ?? null;
    // A stretch already suggested keeps the formatting from before its first suggestion.
    const held = stretch.attributes[FORMAT_CHANGE_MARK] as
      { before?: Record<string, unknown> } | undefined;
    found.run.format(stretch.from, stretch.length, {
      ...attributes,
      [FORMAT_CHANGE_MARK]: { ...mark, before: { ...before, ...held?.before } },
    });
  }
  return `suggested ${ParagraphRefs.text(found.n)} ${mark.id}`;
}

function table(ctx: Context, op: Extract<TextOp, { op: 'table' }>): Outcome {
  const found = TabParagraphs.of(ctx.fragment).paragraph(op.target);
  if ('refused' in found) return found;
  const element = tableOfParagraph(found.paragraph);
  if (!element) return refused('ref_not_found', `${ParagraphRefs.text(found.n)} is not in a table`);
  const normal = Styles.idOfRole(TextDocumentState.styles(ctx.doc, ctx.format), 'normal') ?? '';
  const done = applyTableAction(ctx.doc, element, op.action, normal);
  if (!done.ok) return refused('ref_not_found', done.message);
  const action =
    op.action.action === 'set'
      ? `set ${op.action.row},${op.action.column}`
      : `${op.action.action} ${op.action.n}`;
  return `table ${ParagraphRefs.text(found.n)} ${action}`;
}

function comment(ctx: Context, op: Extract<TextOp, { op: 'comment' }>): Outcome {
  if (op.text.length > TEXT_DOCUMENT_COMMENT_TEXT_MAX)
    return refused(
      'invalid_operation',
      `a comment of at most ${TEXT_DOCUMENT_COMMENT_TEXT_MAX} characters`,
    );
  const found = TabParagraphs.of(ctx.fragment).find(op.old);
  if ('refused' in found) return found;
  const id = ctx.newId();
  LiveThreads.begin(
    ctx.doc,
    {
      id,
      tab: ctx.tab,
      ...LiveThreads.anchorFor(found.run, found.offset, found.offset + op.old.length),
      quote: textOf(found, op.old.length),
      comment: { id: ctx.newId(), text: op.text, at: ctx.now, author: { ...ctx.author } },
    },
    AGENT_TEXT_ORIGIN,
  );
  ctx.threads.push(id);
  return `commented ${ParagraphRefs.text(found.n)} ${id}`;
}

function replace(ctx: Context, op: Extract<TextOp, { op: 'replace' }>): Outcome {
  const { blocks } = inserted(ctx, op.markdown || ' ', false);
  ctx.fragment.delete(0, ctx.fragment.length);
  return `replaced ${insertBlocks(ctx, ctx.fragment, 0, blocks)}`;
}

function applyOne(ctx: Context, line: TextOpLine): Outcome {
  const { op, suggest } = line;
  switch (op.op) {
    case 'edit':
      return edit(ctx, op, suggest);
    case 'insert':
      return insert(ctx, op, suggest);
    case 'append':
    case 'prepend':
      return appendOrPrepend(ctx, op, suggest);
    case 'style':
      return style(ctx, op);
    case 'format':
      return format(ctx, op, suggest);
    case 'table':
      return table(ctx, op);
    case 'comment':
      return comment(ctx, op);
    case 'replace':
      return replace(ctx, op);
  }
}

/** The changeset applied to the state as it stands, or its first refusal; the state itself is never changed. */
export function applyTextChangeset(
  input: TextChangesetInput,
): TextChangesetApplied | TextChangesetRefused {
  const doc = TextDocumentState.load(input.state);
  try {
    const tabs = liveTabList(doc);
    const asked = input.documentTab;
    const tab =
      asked === undefined
        ? tabs[0]!
        : (tabs.find((t) => t.id === asked) ??
          tabs.find((t) => t.name.toLowerCase() === asked.toLowerCase()));
    if (!tab)
      return {
        ok: false,
        error: 'ref_not_found',
        line: 0,
        operation: 0,
        message: `no document tab ${JSON.stringify(asked)}: the document has ${tabs.map((t) => JSON.stringify(t.name)).join(', ')}`,
      };
    const replacing = input.ops.find((o) => o.op.op === 'replace');
    if (
      replacing &&
      !(input.base && VersionSnapshots.sameState(input.base, Y.encodeStateVector(doc)))
    )
      return {
        ok: false,
        error: 'stale_tab',
        line: replacing.line,
        operation: replacing.operation,
        message: 'replace needs base: the X-State-Vector of a view read since the last change',
      };
    const ctx: Context = {
      doc,
      format: input.format,
      tab: tab.id,
      fragment: tabFragment(doc, tab.id),
      author: input.author,
      now: input.now,
      newId: input.newId,
      threads: [],
    };
    const before = Y.snapshot(doc);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    const results: string[] = [];
    let refusal: TextChangesetRefused | null = null;
    doc.transact(() => {
      for (const line of input.ops) {
        const outcome = applyOne(ctx, line);
        if (typeof outcome !== 'string') {
          refusal = { ok: false, ...outcome.refused, line: line.line, operation: line.operation };
          return;
        }
        results.push(outcome);
      }
    }, AGENT_TEXT_ORIGIN);
    if (refusal) return refusal;
    const step = UndoSteps.between(before, Y.snapshot(doc));
    return {
      ok: true,
      documentTab: tab.id,
      results,
      update: updates.length > 0 ? Y.mergeUpdates(updates) : null,
      step,
      threads: ctx.threads,
    };
  } finally {
    doc.destroy();
  }
}
