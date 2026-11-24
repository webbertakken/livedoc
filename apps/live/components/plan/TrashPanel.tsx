'use client';

// The Trash (docs/specs/026-plan/items.md "Trash"): the cards moved there, newest change first. Each row
// carries its type's stripe and glyph, its number and title (two lines), and where it came from and when;
// Restore puts it back in that status, Delete deletes it for good after asking (the workspace Trash's
// ConfirmPopover). Empty Trash deletes them all at once. A popover above its button in Plan mode's tools group, like Card Types.
import { useMemo, useState } from 'react';
import { TRASHED_FROM_FIELD, isTrashed, itemTitle, statusLabel, typeIn } from '@livedoc/items';
import { Button, CountBadge, EmptyState, relativeSince, TrashIcon } from '@livedoc/ui';
import type { DockAnchor } from '@/lib/canvas-chrome';
import { ConfirmPopover } from '@/components/primitives/ConfirmPopover';
import { MovablePanel } from '@/components/primitives/MovablePanel';
import { usePlan } from './PlanContext';
import { PlanTypeGlyph } from './plan-type-glyph';
import { ACCENT_BG, ACCENT_TEXT, ACCENT_TINT, accentVars } from './plan-palette';

export function TrashPanel({
  popoverAnchor,
  onPopoverClose,
}: {
  popoverAnchor?: DockAnchor;
  onPopoverClose: () => void;
}) {
  const plan = usePlan();
  // When the panel opened: each row says how long ago its card was trashed from here.
  const [now] = useState(() => Date.now());
  // The card whose Delete is asking "for good?", and the button it points at.
  const [purging, setPurging] = useState<{ id: string; key: number; anchor: HTMLElement } | null>(
    null,
  );
  const trashed = useMemo(
    () =>
      [...(plan?.items.values() ?? [])].filter(isTrashed).sort((a, b) => b.updatedAt - a.updatedAt),
    [plan?.items],
  );
  if (!plan) return null;
  const { canEdit } = plan;
  return (
    <MovablePanel
      title="Trash"
      helpArticle="planCards"
      position={null}
      defaultCorner="bottom-right"
      width="w-[calc(100vw-2rem)] sm:w-96"
      onMoveTo={() => {}}
      popoverOpen
      popoverAnchor={popoverAnchor}
      asPopover
      popoverWidth="w-[22rem]"
      dismissOnOutside
      onPopoverClose={onPopoverClose}
    >
      <div className="flex flex-col gap-3 px-3 pb-3">
        {trashed.length === 0 ? (
          <EmptyState
            icon={<TrashIcon size={18} />}
            title="The Trash is empty"
            description="Drag a card onto the Trash button to put it out of the way. You can restore it from here."
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-0.5 text-supporting text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                {/* Grey, as every neutral count: the Trash holds nothing urgent (destructive-actions.md). */}
                <CountBadge size="md" background="#64748b26" color="#64748b">
                  {trashed.length}
                </CountBadge>
                {trashed.length === 1 ? 'card' : 'cards'} in the Trash
              </span>
            </div>
            <ul
              aria-label="Cards in the Trash"
              className="flex max-h-96 flex-col gap-2 overflow-y-auto"
            >
              {trashed.map((it) => {
                const type = typeIn(plan.types, it.type);
                const from = it.fields[TRASHED_FROM_FIELD];
                return (
                  <li
                    key={it.id}
                    className="relative overflow-hidden rounded-menu border border-slate-200 bg-white py-2.5 pl-4 pr-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BG}`}
                      style={accentVars(type.color)}
                    />
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className={`flex size-row shrink-0 items-center justify-center rounded-control ${ACCENT_TINT} ${ACCENT_TEXT}`}
                        style={accentVars(type.color)}
                      >
                        <PlanTypeGlyph glyph={type.glyph} size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-body text-slate-800 dark:text-slate-100">
                          {itemTitle(it) || 'Untitled'}
                        </p>
                        <p className="mt-0.5 text-supporting text-slate-500 dark:text-slate-400">
                          {type.label} #{it.key}
                          {typeof from === 'string' && plan.statusNames.has(from)
                            ? ` · from ${statusLabel(from, plan.statusNames)}`
                            : ''}{' '}
                          · {relativeSince(it.updatedAt, now)}
                        </p>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Delete #${it.key} for good`}
                          className="flex h-row items-center gap-1 rounded-control px-2 text-supporting text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          onClick={(e) =>
                            setPurging({ id: it.id, key: it.key, anchor: e.currentTarget })
                          }
                        >
                          <TrashIcon size={13} />
                          Delete
                        </button>
                        <Button
                          variant="secondary"
                          size="xs"
                          aria-label={`Restore #${it.key}`}
                          className="h-row px-3"
                          onClick={() => {
                            plan.restoreItem(it.id);
                            plan.announce(`#${it.key} restored`);
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canEdit ? (
              <Button
                variant="secondary"
                className="gap-2 rounded-menu py-2 text-body"
                // At once, no confirm: pressing Empty Trash in the Trash is the intent (items.md "Trash").
                onClick={() => {
                  plan.emptyTrash();
                  plan.announce('Trash emptied');
                  // Nothing left to show: the panel closes.
                  onPopoverClose();
                }}
              >
                <TrashIcon size={14} />
                Empty Trash
                <CountBadge
                  count={trashed.length}
                  background="rgba(255, 255, 255, 0.25)"
                  color="#ffffff"
                />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {purging ? (
        <ConfirmPopover
          anchor={purging.anchor}
          message={`Delete #${purging.key} for good? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            plan.deleteItem(purging.id);
            setPurging(null);
          }}
          onCancel={() => setPurging(null)}
        />
      ) : null}
    </MovablePanel>
  );
}
