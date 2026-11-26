'use client';

// The Plan Sheet's Data Validation rule editor (docs/specs/029-sheets/data-validation.md "Making and changing rules"):
// the rule form in a popover anchored to what opened it, on the given rule, the active cell's, or a new one.
import { posRangeOf } from '@livedoc/sheets';
import { AnchoredPopover } from '@/components/primitives/AnchoredPopover';
import { useSheetController } from '../sheet-controller';
import type { SheetActions } from '../useSheetActions';
import { SheetValidationForm } from './SheetValidationForm';

const EDITOR_WIDTH_PX = 352;

export function SheetValidationEditor({
  actions,
  anchor,
  ruleId,
  fresh = false,
  onClose,
}: {
  actions: SheetActions;
  anchor: HTMLElement;
  ruleId?: string;
  // A new rule over the selection (Dropdown), never the active cell's.
  fresh?: boolean;
  onClose: () => void;
}) {
  const c = useSheetController();
  const existing = fresh
    ? undefined
    : ((ruleId ? c.sheet.layout.rules?.find((x) => x.id === ruleId) : undefined) ??
      (() => {
        const { active } = c.selection;
        const at = c.sheet.layout.rules?.find((x) => {
          const p = posRangeOf(c.sheet.layout, x);
          return p && active.r >= p.r1 && active.r <= p.r2 && active.c >= p.c1 && active.c <= p.c2;
        });
        return at;
      })());
  return (
    <AnchoredPopover
      anchor={anchor}
      name="Data Validation"
      width={EDITOR_WIDTH_PX}
      onClose={onClose}
    >
      <SheetValidationForm actions={actions} existing={existing} onClose={onClose} />
    </AnchoredPopover>
  );
}
