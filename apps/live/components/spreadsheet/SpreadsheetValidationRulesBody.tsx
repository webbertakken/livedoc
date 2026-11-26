'use client';

// Data › Data Validation's side panel (docs/specs/029-sheets/data-validation.md "In a spreadsheet", data-tools.md
// "Data validation"): the open sheet's rules, each its range and short line, opening the rule form; Add Rule makes a
// new one over the selection. It opens on the rule at the active cell, or on a new rule when asked (Insert › Dropdown).
import { useState } from 'react';
import { TrashIcon } from '@livedoc/ui';
import { posRangeOf, ruleRangeText, type ValidationRule } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { SheetValidationForm } from '@/components/sheets/rules/SheetValidationForm';
import { validationRuleShortLine } from '@/components/sheets/rules/SheetRuleSettings';
import type { SheetActions } from '@/components/sheets/useSheetActions';

export const NO_RULES_TEXT = 'No validation rules on this sheet yet.';

// What the form is open on: a rule by id, a new rule, or nothing (the list).
type Editing = { id: string } | 'new' | null;

const ROW_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function SpreadsheetValidationRulesBody({
  actions,
  startNew = false,
}: {
  actions: SheetActions;
  // Insert › Dropdown: a new Dropdown over the selection, whatever the active cell holds.
  startNew?: boolean;
}) {
  const c = useSheetController();
  const rules = c.sheet.layout.rules ?? [];
  const [editing, setEditing] = useState<Editing>(() => {
    if (startNew) return 'new';
    const { active } = c.selection;
    const at = rules.find((x) => {
      const p = posRangeOf(c.sheet.layout, x);
      return p && active.r >= p.r1 && active.r <= p.r2 && active.c >= p.c1 && active.c <= p.c2;
    });
    return at ? { id: at.id } : null;
  });
  const back = () => setEditing(null);
  if (editing) {
    const existing: ValidationRule | undefined =
      editing === 'new' ? undefined : rules.find((x) => x.id === editing.id);
    return (
      <SheetValidationForm
        key={editing === 'new' ? 'new' : editing.id}
        actions={actions}
        existing={existing}
        inPanel
        onClose={back}
      />
    );
  }
  return (
    <>
      {rules.length ? (
        <ul className="flex flex-col gap-1" aria-label="Validation rules">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-(--office-hover)"
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => setEditing({ id: rule.id })}
              >
                <span className="block truncate">{validationRuleShortLine(rule, c)}</span>
                <span className="block text-supporting text-(--office-muted)">
                  {ruleRangeText(c.sheet.layout, rule)}
                </span>
              </button>
              <button
                type="button"
                aria-label="Delete Rule"
                className={ROW_BUTTON}
                onClick={() => actions.removeValidationRule(rule.id)}
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-supporting text-(--office-muted)">{NO_RULES_TEXT}</p>
      )}
      <button
        type="button"
        className="mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
        onClick={() => setEditing('new')}
      >
        Add Rule
      </button>
    </>
  );
}
