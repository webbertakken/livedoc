'use client';

// The Named Functions panel's form (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"): a name,
// its description, its argument placeholders and the formula defining it; under Argument Details, closed until
// opened, each placeholder's description and example. Create (Update when editing) saves the workbook's list whole as
// one undo step; a field the rules refuse says why under it.
import { useId, useRef, useState } from 'react';
import { Button, CloseIcon, TextArea, TextInput } from '@livedoc/ui';
import {
  NAMED_FUNCTION_DESCRIPTION_MAX,
  NAMED_FUNCTION_HINT_MAX,
  NAMED_FUNCTION_NAME_MAX,
  NAMED_FUNCTION_PARAMS_MAX,
  NamedFunction,
  namedFunctionProblem,
  type NamedFunctionProblem,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

const label = 'block text-supporting text-(--office-muted)';
const error = 'text-supporting text-red-600 dark:text-red-400';
const LINK_BUTTON =
  'mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';
const ROW_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

// A placeholder as the form holds it: a key that stays with it as others are removed, and its details.
type Argument = { key: number; name: string; description: string; example: string };

function argumentsOf(fn: NamedFunction | undefined): Argument[] {
  return (fn?.params ?? []).map((name, i) => ({
    key: i,
    name,
    description: fn?.hints?.[i]?.description ?? '',
    example: fn?.hints?.[i]?.example ?? '',
  }));
}

export function NamedFunctionForm({
  existing,
  others,
  onSave,
  onClose,
}: {
  // The function edited; none for a new one.
  existing: NamedFunction | undefined;
  // The workbook's other named functions, the edited one left out.
  others: readonly NamedFunction[];
  // Saves the function (its old name for an edit); false when it was not saved.
  onSave: (fn: NamedFunction) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [args, setArgs] = useState<Argument[]>(() => argumentsOf(existing));
  const nextKey = useRef(args.length);
  const [body, setBody] = useState(existing?.body ?? '=');
  const [details, setDetails] = useState(false);
  const [why, setWhy] = useState<NamedFunctionProblem | null>(null);
  const [saving, setSaving] = useState(false);

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setWhy(null);
      set(v);
    };
  const setArg = (key: number, patch: Partial<Argument>) => {
    setWhy(null);
    setArgs((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  };

  const done = async () => {
    const fn = NamedFunction.normalised({
      name,
      params: args.map((a) => a.name),
      body,
      description,
      hints: args.map((a) => ({ description: a.description, example: a.example })),
    });
    const problem = namedFunctionProblem(fn, others);
    if (problem) {
      debugLog('[workbook] named function refused', { field: problem.field });
      return setWhy(problem);
    }
    setSaving(true);
    const saved = await onSave(fn);
    setSaving(false);
    if (!saved) return;
    track('Spreadsheet', 'Changed', 'NamedFunction');
    onClose();
  };

  const whyOf = (field: NamedFunctionProblem['field'], index?: number) =>
    why && why.field === field && why.index === index ? why.message : null;
  const message = (field: NamedFunctionProblem['field'], index?: number) => {
    const text = whyOf(field, index);
    const at = `${id}-${field}-${index ?? ''}-why`;
    return {
      describedBy: text ? at : undefined,
      node: text ? (
        <span id={at} className={error} role="alert">
          {text}
        </span>
      ) : null,
    };
  };
  const nameWhy = message('name');
  const descriptionWhy = message('description');
  const bodyWhy = message('definition');
  // An argument refused past the last field (too many): said under the list.
  const listWhy = message('argument', args.length);

  return (
    <form
      className="flex flex-col gap-3"
      aria-label={existing ? `Edit ${existing.name}` : 'Add New Function'}
      onSubmit={(e) => {
        e.preventDefault();
        void done();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className={label}>
          Function Name
        </label>
        <TextInput
          id={`${id}-name`}
          autoFocus
          className="font-mono"
          maxLength={NAMED_FUNCTION_NAME_MAX + 1}
          value={name}
          aria-invalid={!!nameWhy.node}
          aria-describedby={nameWhy.describedBy}
          onChange={(e) => change(setName)(e.target.value.toUpperCase())}
        />
        {nameWhy.node}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className={label}>
          Function Description
        </label>
        <TextArea
          id={`${id}-description`}
          rows={2}
          maxLength={NAMED_FUNCTION_DESCRIPTION_MAX + 1}
          value={description}
          aria-invalid={!!descriptionWhy.node}
          aria-describedby={descriptionWhy.describedBy}
          onChange={(e) => change(setDescription)(e.target.value)}
        />
        {descriptionWhy.node}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className={label}>Argument Placeholders</legend>
        {args.map((a, i) => {
          const argWhy = message('argument', i);
          return (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <TextInput
                  aria-label={`Argument ${i + 1}`}
                  className="font-mono"
                  value={a.name}
                  aria-invalid={!!argWhy.node}
                  aria-describedby={argWhy.describedBy}
                  onChange={(e) => setArg(a.key, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove Argument ${i + 1}`}
                  className={ROW_BUTTON}
                  onClick={() => {
                    setWhy(null);
                    setArgs((list) => list.filter((x) => x.key !== a.key));
                  }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              {argWhy.node}
            </div>
          );
        })}
        {args.length < NAMED_FUNCTION_PARAMS_MAX ? (
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => {
              setWhy(null);
              setArgs((list) => [
                ...list,
                { key: nextKey.current++, name: '', description: '', example: '' },
              ]);
            }}
          >
            Add Argument
          </button>
        ) : null}
        {listWhy.node}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-body`} className={label}>
          Formula Definition
        </label>
        <TextArea
          id={`${id}-body`}
          rows={3}
          className="font-mono"
          spellCheck={false}
          value={body}
          aria-invalid={!!bodyWhy.node}
          aria-describedby={bodyWhy.describedBy}
          onChange={(e) => change(setBody)(e.target.value)}
        />
        {bodyWhy.node}
      </div>
      {args.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={details}
            className="flex h-row cursor-pointer items-center gap-1 text-left text-body text-(--office-muted)"
            onClick={() => setDetails(!details)}
          >
            <span aria-hidden>{details ? '▾' : '▸'}</span> Argument Details
          </button>
          {details
            ? args.map((a, i) => {
                const shown = a.name.trim() || `Argument ${i + 1}`;
                return (
                  <div key={a.key} className="flex flex-col gap-1">
                    <span className={`${label} font-mono`} aria-hidden>
                      {shown}
                    </span>
                    <TextInput
                      aria-label={`${shown} Description`}
                      placeholder="Description"
                      maxLength={NAMED_FUNCTION_HINT_MAX + 1}
                      value={a.description}
                      onChange={(e) => setArg(a.key, { description: e.target.value })}
                    />
                    <TextInput
                      aria-label={`${shown} Example`}
                      placeholder="Example"
                      className="font-mono"
                      maxLength={NAMED_FUNCTION_HINT_MAX + 1}
                      value={a.example}
                      onChange={(e) => setArg(a.key, { example: e.target.value })}
                    />
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={saving}>
          {existing ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
