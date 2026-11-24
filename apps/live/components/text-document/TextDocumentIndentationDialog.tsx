'use client';

// Format > Align & indent > Indentation options (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and
// indents"): the left and right indents and the special indent of the paragraphs the selection touches, in the
// browser's unit. A field shows the paragraphs' value, blank where they differ; a blank field changes nothing.
import { useId, useState } from 'react';
import { ptOf, readIndentField, unitOf, type IndentUnit } from '@/lib/text-document/indent-units';
import {
  INDENT_STEP_PT,
  type Indents,
} from '@/lib/text-document/text-document-paragraph-formatting';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { TextDocumentLengthField } from './TextDocumentLengthField';

type Special = 'none' | 'first' | 'hanging';

const SPECIALS: readonly { value: Special; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'first', label: 'First line' },
  { value: 'hanging', label: 'Hanging' },
];

const shown = (pt: number | null, unit: IndentUnit) =>
  pt === null ? '' : String(unitOf(pt, unit));

function specialOf(first: number | null): Special | null {
  if (first === null) return null;
  return first > 0 ? 'first' : first < 0 ? 'hanging' : 'none';
}

export function TextDocumentIndentationDialog({
  open,
  indents,
  unit,
  onApply,
  onClose,
}: {
  open: boolean;
  // The paragraphs' indents in points, each null where they differ.
  indents: Indents;
  unit: IndentUnit;
  // The indents to set, in points; null leaves each paragraph's own.
  onApply: (indents: Indents) => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(() => shown(indents.start, unit));
  const [right, setRight] = useState(() => shown(indents.end, unit));
  const [special, setSpecial] = useState<Special | ''>(() => specialOf(indents.first) ?? '');
  const [size, setSize] = useState(() =>
    indents.first === null || indents.first === 0 ? '' : shown(Math.abs(indents.first), unit),
  );
  const specialId = useId();
  const read = (text: string) => readIndentField(text, unit);
  const sized = special === 'first' || special === 'hanging';
  const invalid = [left, right, ...(sized ? [size] : [])].some((t) => read(t) === 'invalid');
  const apply = () => {
    const pt = (text: string) => {
      const value = read(text);
      return typeof value === 'number' ? ptOf(value, unit) : null;
    };
    const firstSize = pt(size);
    const first =
      special === 'none'
        ? 0
        : special === 'first' && firstSize !== null
          ? firstSize
          : special === 'hanging' && firstSize !== null
            ? -firstSize
            : null;
    onApply({ start: pt(left), end: pt(right), first });
  };
  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Indentation options"
      primary={{ label: 'Apply', onPress: apply, disabled: invalid }}
    >
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-4 pt-1">
        <span className="pt-2 text-body">Left</span>
        <TextDocumentLengthField label="Left" value={left} unit={unit} onChange={setLeft} />
        <span className="pt-2 text-body">Right</span>
        <TextDocumentLengthField label="Right" value={right} unit={unit} onChange={setRight} />
        <label htmlFor={specialId} className="pt-2 text-body">
          Special indent
        </label>
        <div className="flex flex-wrap items-start gap-3">
          <select
            id={specialId}
            value={special}
            onChange={(e) => {
              const next = e.target.value as Special;
              setSpecial(next);
              // A first-line or hanging indent starts at one step, 0.5 in, as Google's does.
              if (next !== 'none' && size === '') setSize(shown(INDENT_STEP_PT, unit));
            }}
            className="h-field cursor-pointer rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) [&>option]:bg-(--office-menu)"
          >
            {special === '' ? <option value="">Mixed</option> : null}
            {SPECIALS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <TextDocumentLengthField
            label="Special indent size"
            value={sized ? size : ''}
            unit={unit}
            disabled={!sized}
            onChange={setSize}
          />
        </div>
      </div>
    </OfficeDialog>
  );
}
