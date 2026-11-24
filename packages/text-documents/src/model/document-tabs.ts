// Document tabs (docs/specs/034-text-documents/text-document.md "Tabs inside one text document", "What a document tab
// is"; standard-mapping.md "Document tabs"): the text document's own named parts, each with a body, in the outline's
// order. The first tab's body is the document's `body`; `tabs` names it and holds the others.
import type { Block, SectionBreak } from './blocks';
import { canonical } from './props';
import type { PageSetup } from './sections';
import type { TextDocument } from './text-document';

/** The id of a text document's first document tab, and of the tab whose body the live state's `body` holds. */
export const FIRST_DOCUMENT_TAB_ID = 't.0';
/** Google Docs' nesting depth: a tab, its subtab and that one's subtab. */
export const TEXT_DOCUMENT_TAB_DEPTH = 3;
/** (default) The longest name a document tab holds. */
export const TEXT_DOCUMENT_TAB_NAME_MAX = 100;
/** (default) The most document tabs a text document holds. */
export const TEXT_DOCUMENT_MAX_TABS = 100;
/** (default) The longest emoji held, in UTF-16 code units: a family or flag sequence fits. */
export const DOCUMENT_TAB_EMOJI_MAX = 16;
/** (default, Google's form) The random letters and digits of a tab added later. */
const NEW_ID_LENGTH = 12;
const ID_FORM = /^t\.[a-z0-9]{1,24}$/;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export type DocumentTabDepth = 0 | 1 | 2;

/** A document tab's id, name and emoji. */
export type DocumentTabHead = {
  readonly id: string;
  readonly name: string;
  readonly emoji?: string;
};

/** A document tab: its head, its depth in the outline (0 at the top level) and its body. */
export type DocumentTab = DocumentTabHead & {
  readonly depth: DocumentTabDepth;
  readonly body: readonly Block[];
};

/** The document tabs as the model holds them: the first's head (its body is the document's) and the others. */
export type DocumentTabs = {
  readonly first: DocumentTabHead;
  readonly more: readonly DocumentTab[];
};

/** A tab as read from a file or the live state, before it is held to the rules. */
export type DocumentTabRead = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly emoji?: unknown;
  readonly depth?: unknown;
  readonly body: readonly Block[];
};

/** Where a tab read from a file starts among the body's blocks, and what the file said of it. */
export type DocumentTabStart = {
  readonly at: number;
  readonly head: Omit<DocumentTabRead, 'body'>;
};

/** The document's tabs as one flow of blocks, each tab after the first opened by a section break of its own. */
export type DocumentTabFlow = {
  readonly tabs: readonly DocumentTab[];
  readonly blocks: readonly Block[];
  /** The section break opening each tab after the first: `opens[k - 1]` opens `tabs[k]`. */
  readonly opens: readonly SectionBreak[];
};

// The page colour is the whole document's in OOXML, so a later section never reads one: setups compare without it.
const sameSetup = (a: PageSetup, b: PageSetup): boolean =>
  canonical({ ...a, pageColor: undefined }) === canonical({ ...b, pageColor: undefined });

/** Whether the block is a section break that only returns to the first section's setup. */
const returnsToFirst = (block: Block | undefined, first: PageSetup): boolean =>
  block?.type === 'section' && !block.region && sameSetup(block.setup, first);

const defaultName = (n: number): string => `Tab ${n}`;

const FIRST_HEAD: DocumentTabHead = { id: FIRST_DOCUMENT_TAB_ID, name: defaultName(1) };

const depthOf = (value: unknown, previous: number | undefined): DocumentTabDepth => {
  if (previous === undefined) return 0;
  const said = typeof value === 'number' && Number.isInteger(value) ? value : Number(value);
  const wanted = Number.isInteger(said) && said > 0 ? said : 0;
  return Math.min(wanted, previous + 1, TEXT_DOCUMENT_TAB_DEPTH - 1) as DocumentTabDepth;
};

const nameOf = (value: unknown, place: number): string => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length > 0
    ? [...name].slice(0, TEXT_DOCUMENT_TAB_NAME_MAX).join('')
    : defaultName(place);
};

const emojiOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= DOCUMENT_TAB_EMOJI_MAX
    ? value
    : undefined;

const headOf = (tab: DocumentTabHead): DocumentTabHead =>
  tab.emoji === undefined
    ? { id: tab.id, name: tab.name }
    : { id: tab.id, name: tab.name, emoji: tab.emoji };

export const DocumentTabs = {
  defaultName,
  /** The head of the one tab every text document has until it is given others. */
  firstHead: (): DocumentTabHead => ({ ...FIRST_HEAD }),
  /** Every document tab in the outline's order, the first included with the document's body. */
  all: (document: TextDocument): DocumentTab[] => [
    { ...(document.tabs?.first ?? FIRST_HEAD), depth: 0, body: document.body },
    ...(document.tabs?.more ?? []),
  ],
  /** The document with these tabs: the first's body its body; no `tabs` when they are the plain one tab. */
  withAll: (document: TextDocument, tabs: readonly DocumentTab[]): TextDocument => {
    const [first, ...more] = tabs;
    const { tabs: _, ...rest } = document;
    if (!first) return { ...rest, body: [] };
    const held: DocumentTabs = { first: headOf(first), more };
    return DocumentTabs.isPlainTabs(held)
      ? { ...rest, body: first.body }
      : { ...rest, body: first.body, tabs: held };
  },
  /** Whether these tabs are the one tab every text document has unnamed: `t.0`, Tab 1, no emoji. */
  isPlainTabs: (tabs: DocumentTabs | undefined): boolean =>
    tabs === undefined ||
    (tabs.more.length === 0 &&
      tabs.first.id === FIRST_HEAD.id &&
      tabs.first.name === FIRST_HEAD.name &&
      tabs.first.emoji === undefined),
  /** Whether the document is written as an ordinary text document, with no tab extension. */
  isPlain: (document: TextDocument): boolean => DocumentTabs.isPlainTabs(document.tabs),
  /** Every tab's blocks, in the outline's order: what walks over the whole document read. */
  blocks: (document: TextDocument): Block[] =>
    document.tabs ? DocumentTabs.all(document).flatMap((t) => t.body) : [...document.body],
  /** The document with each tab's body changed by `change`. */
  mapBodies: (
    document: TextDocument,
    change: (body: readonly Block[]) => readonly Block[],
  ): TextDocument => {
    const body = change(document.body);
    if (!document.tabs) return { ...document, body };
    return {
      ...document,
      body,
      tabs: {
        first: document.tabs.first,
        more: document.tabs.more.map((t) => ({ ...t, body: change(t.body) })),
      },
    };
  },
  /**
   * Tabs read from a file or the live state, held to the rules (standard-mapping.md "Document tabs", "Read"): an id
   * out of form or repeated is `t.<n>`, n its place from 0; an empty name is Tab N; each depth at most one deeper than
   * the one before it, the first at 0, none past 2; an emoji kept only when short enough; past the most, the rest
   * join the last held tab's body.
   */
  held: (read: readonly DocumentTabRead[]): DocumentTab[] => {
    const seen = new Set<string>();
    const out: DocumentTab[] = [];
    read.forEach((tab, place) => {
      if (out.length === TEXT_DOCUMENT_MAX_TABS) {
        const last = out.at(-1)!;
        out[out.length - 1] = { ...last, body: [...last.body, ...tab.body] };
        return;
      }
      const said = typeof tab.id === 'string' && ID_FORM.test(tab.id) ? tab.id : undefined;
      let id = said !== undefined && !seen.has(said) ? said : `t.${place}`;
      for (let n = place; seen.has(id); n += 1) id = `t.${n + 1}`;
      seen.add(id);
      const emoji = emojiOf(tab.emoji);
      out.push({
        id,
        name: nameOf(tab.name, out.length + 1),
        ...(emoji === undefined ? {} : { emoji }),
        depth: depthOf(tab.depth, out.at(-1)?.depth),
        body: tab.body,
      });
    });
    return out;
  },
  /**
   * The body a file read, split into tabs where they start (standard-mapping.md "Document tabs", "Read"): writing
   * before the first start joins the first tab, writing between two the one before; a tab's opening section break that
   * only returns to the first section's setup is no section break of its own. No starts leave the document as read.
   */
  split: (document: TextDocument, starts: readonly DocumentTabStart[]): TextDocument => {
    if (starts.length === 0) return document;
    const blocks = document.body;
    const read = starts.map((start, k): DocumentTabRead => {
      const from = k === 0 ? 0 : start.at;
      const to = starts[k + 1]?.at ?? blocks.length;
      const body = blocks.slice(from, Math.max(from, to));
      const opening = k > 0 && returnsToFirst(body[0], document.section.setup);
      return { ...start.head, body: opening ? body.slice(1) : body };
    });
    return DocumentTabs.withAll(document, DocumentTabs.held(read));
  },
  /** Whether the tab turns the page setup on a new page, so the tab after it must turn it back. */
  turnsPage: (tab: DocumentTab): boolean =>
    tab.body.some((b) => b.type === 'section' && b.start !== 'continuous'),
  /**
   * The tabs as one flow for a writer whose tabs are section breaks (OOXML): each tab after the first opened by a
   * break back to the first section's setup, on a new page when the tab before it turned the page, else continuous.
   */
  flow: (document: TextDocument): DocumentTabFlow => {
    const tabs = DocumentTabs.all(document);
    const blocks: Block[] = [];
    const opens: SectionBreak[] = [];
    tabs.forEach((tab, k) => {
      if (k > 0) {
        const open: SectionBreak = {
          type: 'section',
          start: DocumentTabs.turnsPage(tabs[k - 1]!) ? 'next-page' : 'continuous',
          setup: document.section.setup,
        };
        opens.push(open);
        blocks.push(open);
      }
      blocks.push(...tab.body);
    });
    return { tabs, blocks, opens };
  },
  /** A new tab's id: `t.` and 12 lower-case letters and digits, from `random` (0 to 1). */
  newId: (random: () => number = Math.random): string =>
    `t.${Array.from({ length: NEW_ID_LENGTH }, () => ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length) % ID_ALPHABET.length]).join('')}`,
} as const;
