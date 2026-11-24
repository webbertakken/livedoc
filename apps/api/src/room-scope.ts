// The realtime room's half of tab-scoped share links (docs/specs/013-workspace/tab-scoped-share-links.md):
// what a session confined to one tab may receive and may send. Pure, so every
// rule is tested without a socket; the room applies them to each frame.
//
// Both directions fail closed: an op kind nobody taught these rules about is
// withheld from, and refused from, a scoped session.
//
// A link to one tab reaches its drawing tabs too ("Drawing tabs"): `drawingOf` answers a tab's text document tab
// from the room's store; the default knows none, so only the scope's own tab passes.
import { scopeAdmits } from './tab-scope';

export type DrawingOf = (tabId: string) => string | null;
const NO_DRAWINGS: DrawingOf = () => null;

// Ops that carry no tab and say nothing about one, which a scoped session
// still receives: session tools and the worker's share-link and Trash notices.
const TAB_LESS_DELIVERED = new Set([
  'poll-start',
  'poll-answer',
  'poll-end',
  'share-revoked',
  'share-rescoped',
  'document-trashed',
  // The type catalogue holds no content and every tab's cards need it
  // (docs/specs/026-plan/item-types.md "Storage and sync").
  'item-types',
]);

// The tab-less ops a scoped session may itself send.
// A follow (docs/specs/012-collaboration/follow-me-viewport.md) names a person, not a tab, so a scoped visitor may follow too.
const TAB_LESS_SENDABLE = new Set(['poll-start', 'poll-answer', 'poll-end', 'follow']);

type LooseOp = { kind?: unknown; tabId?: unknown; tabs?: unknown };
type MetaTab = { id: string; orderIndex: number; drawingOf?: string };

function asOp(op: unknown): LooseOp | null {
  return typeof op === 'object' && op !== null ? op : null;
}

// The tab an op names, or null for an op that names none.
export function opTabOf(op: unknown): string | null {
  const o = asOp(op);
  return o && typeof o.tabId === 'string' ? o.tabId : null;
}

// Whether an op is about the scoped tab or one of its drawing tabs. `undefined` = the op names no tab
// at all, so the caller decides by kind.
function onScope(o: LooseOp, tabScope: string, drawingOf: DrawingOf): boolean | undefined {
  if ('tabId' in o) return typeof o.tabId === 'string' && scopeAdmits(tabScope, o.tabId, drawingOf);
  if (o.kind === 'select') return false;
  return undefined;
}

// The op as a session scoped to `tabScope` should see it, or null to
// withhold it. `tabScope` null (owner, team member, All-tabs link) passes
// every op through untouched.
export function opForScope(
  op: unknown,
  tabScope: string | null,
  drawingOf: DrawingOf = NO_DRAWINGS,
): unknown {
  if (tabScope === null) return op;
  const o = asOp(op);
  if (!o) return null;
  if (o.kind === 'document-meta') return redactDocumentMeta(o, tabScope, drawingOf);
  // Item writes may touch items another tab shows: a scoped session hears that the store
  // moved on, without the items, and refetches the ones its tab shows
  // (docs/specs/026-plan/items.md "Who may do what").
  if (o.kind === 'items') return { ...o, upserts: [], removed: [] };
  const mine = onScope(o, tabScope, drawingOf);
  if (mine !== undefined) return mine ? op : null;
  return typeof o.kind === 'string' && TAB_LESS_DELIVERED.has(o.kind) ? op : null;
}

// Whether a scoped session's op renames its tab: a `tab-meta` patch that sets `name` or clears it. A tab's name is
// structure (docs/specs/013-workspace/tab-scoped-share-links.md "Structure").
export function scopedRenames(op: unknown, tabScope: string | null): boolean {
  if (tabScope === null) return false;
  const o = op as { kind?: unknown; patch?: unknown; clear?: unknown } | null;
  if (o?.kind !== 'tab-meta') return false;
  const patch = o.patch;
  if (typeof patch === 'object' && patch !== null && Object.hasOwn(patch, 'name')) return true;
  return Array.isArray(o.clear) && o.clear.includes('name');
}

// Whether a session scoped to `tabScope` may put this op into the room: only an op about its own tab, and, unless the
// tab already showed every card when it joined (`tabShowsAll`), never one carrying a board or plan view, which would
// widen what the link reaches (docs/specs/026-plan/items.md "Who may do what").
// The role gate runs separately; this only confines the tab.
export function scopedSenderMayRelay(
  op: unknown,
  tabScope: string | null,
  tabShowsAll = false,
  drawingOf: DrawingOf = NO_DRAWINGS,
): boolean {
  if (tabScope === null) return true;
  const o = asOp(op);
  if (!o || o.kind === 'document-meta') return false;
  const mine = onScope(o, tabScope, drawingOf);
  if (mine !== undefined) return mine && (tabShowsAll || !carriesEveryCardElement(op));
  return typeof o.kind === 'string' && TAB_LESS_SENDABLE.has(o.kind);
}

const EVERY_CARD_SHAPES = new Set(['plan-board', 'plan-view']);
// An op nests its elements a few levels down at most (`tab.elements[]`, `ops[].element`); deeper is refused as one.
const OP_SCAN_DEPTH = 8;

// Whether an op holds, anywhere in its payload, an element that shows every card. Fails closed past OP_SCAN_DEPTH.
function carriesEveryCardElement(value: unknown, depth = 0): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (depth > OP_SCAN_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => carriesEveryCardElement(v, depth + 1));
  const shape = (value as { shape?: unknown }).shape;
  if (typeof shape === 'string' && EVERY_CARD_SHAPES.has(shape)) return true;
  return Object.values(value).some((v) => carriesEveryCardElement(v, depth + 1));
}

// document-meta carries every tab's name and folder. Other tabs keep their id
// and position and are marked out of scope, exactly like the REST document
// (redactDocumentForScope): the scope's drawing tabs, as the store knows them, stay whole, and a drawing tab keeps
// its `drawingOf` so it never shows as a tab of its own.
function redactDocumentMeta(o: LooseOp, tabScope: string, drawingOf: DrawingOf): unknown {
  if (!Array.isArray(o.tabs)) return null;
  return {
    ...o,
    tabs: (o.tabs as MetaTab[]).map((t) =>
      scopeAdmits(tabScope, t.id, drawingOf)
        ? t
        : {
            id: t.id,
            name: '',
            orderIndex: t.orderIndex,
            outOfScope: true,
            ...(typeof t.drawingOf === 'string' ? { drawingOf: t.drawingOf } : {}),
          },
    ),
  };
}
