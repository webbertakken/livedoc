import {
  CHANGESET_TOAST_COALESCE_MS,
  type ChangesetRoomOp,
  type TextChangesetRoomOp,
} from '@livedoc/api-schema';

// The toast one person's (or one agent's) burst of changesets raises
// (docs/specs/024-agents/agent-changesets.md). Pure:
// the hook owns the clock and the toast stack.

export type ChangesetToast = {
  // The token's agentKey for an agent, else the changeset id: one toast per token at a time.
  key: string;
  changesetIds: string[];
  count: number;
  name: string;
  summary: string | null;
  lastAt: number;
  tabId: string;
  touched: string[];
  // A text document's changesets: they change writing, not elements, so the toast names the document.
  text: boolean;
};

export function coalesceChangesetToast(
  toasts: ReadonlyMap<string, ChangesetToast>,
  op: ChangesetRoomOp | TextChangesetRoomOp,
  now: number,
): ChangesetToast {
  const text = op.kind === 'text-changeset';
  const key = op.agentKey ?? op.id;
  const count = op.counts.added + op.counts.changed + op.counts.removed;
  const summary = op.summary ?? null;
  const touched = text ? [] : touchedIdsOf(op);
  const open = toasts.get(key);
  if (open && now - open.lastAt <= CHANGESET_TOAST_COALESCE_MS) {
    return {
      ...open,
      changesetIds: [...open.changesetIds, op.id],
      count: open.count + count,
      summary,
      lastAt: now,
      tabId: op.tabId,
      touched: [...new Set([...open.touched, ...touched])],
      text: open.text && text,
    };
  }
  return {
    key,
    changesetIds: [op.id],
    count,
    name: op.author.name,
    summary,
    lastAt: now,
    tabId: op.tabId,
    touched,
    text,
  };
}

// "Webber changed 3 elements: add payment service". Adds and removals count as changed. A text document's:
// "Webber changed the document: tighten the intro".
export function changesetToastCopy(toast: ChangesetToast): string {
  if (toast.text)
    return `${toast.name} changed the document${toast.summary ? `: ${toast.summary}` : ''}`;
  const elements = `${toast.count} element${toast.count === 1 ? '' : 's'}`;
  return `${toast.name} changed ${elements}${toast.summary ? `: ${toast.summary}` : ''}`;
}

export function undoneCopy(kept: number): string {
  if (kept === 0) return 'Undone';
  return `Undone, ${kept} kept because ${kept === 1 ? 'it' : 'they'} changed since`;
}

// Every element a changeset touched: its element ops' ids, or the list an oversize relay carries.
export function touchedIdsOf(op: ChangesetRoomOp): string[] {
  if (!op.elementOps) return op.touched ?? [];
  const ids = new Set<string>();
  for (const elOp of op.elementOps) {
    if (elOp.kind === 'remove') ids.add(elOp.id);
    else if (elOp.kind !== 'reorder') ids.add(elOp.element.id);
  }
  return [...ids];
}
