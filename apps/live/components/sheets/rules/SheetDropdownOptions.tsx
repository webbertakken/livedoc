'use client';

// A dropdown's options (docs/specs/029-sheets/data-validation.md "Dropdowns"): each option's colour and text, dragged to
// reorder, removed, and added after one by Enter or at the end. The Data Validation form and a table column's Edit
// Column Type (data-tools.md "Tables" "Column menu") hold it.
import { useState } from 'react';
import { Button, TextInput } from '@livedoc/ui';
import { DROPDOWN_OPTIONS_MAX, DROPDOWN_OPTION_MAX } from '@livedoc/sheets';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { noColour } from '@/components/colour/colour-options';
import { nextKey, OPTION_COLOURS, OPTION_GROUPS, type Option } from './validation-draft';

export function SheetDropdownOptions({
  opts,
  onChange,
}: {
  opts: Option[];
  onChange: (opts: Option[]) => void;
}) {
  const palette = OPTION_COLOURS;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const setOpt = (key: number, patch: Partial<Option>) =>
    onChange(opts.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const addOptAfter = (key?: number) => {
    if (opts.length >= DROPDOWN_OPTIONS_MAX) return;
    const at = key === undefined ? opts.length : opts.findIndex((o) => o.key === key) + 1;
    const next = [...opts];
    next.splice(at, 0, { key: nextKey(), v: '', c: palette[opts.length % palette.length] });
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2" role="list" aria-label="Options">
      {opts.map((o, i) => (
        <div
          key={o.key}
          role="listitem"
          className="flex items-center gap-2"
          draggable={false}
          onDragOver={(e) => dragFrom !== null && e.preventDefault()}
          onDrop={() => {
            if (dragFrom === null || dragFrom === i) return;
            const next = [...opts];
            const [moved] = next.splice(dragFrom, 1);
            next.splice(i, 0, moved!);
            setDragFrom(null);
            onChange(next);
          }}
        >
          <span
            aria-hidden
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragEnd={() => setDragFrom(null)}
            className="cursor-grab select-none px-0.5 text-slate-400"
          >
            ⋮⋮
          </span>
          <ColourSwatchButton
            label={`Colour for ${o.v || `Option ${i + 1}`}`}
            swatch={o.c ?? 'transparent'}
            none={!o.c}
            value={o.c ?? 'none'}
            leading={[noColour('none', 'No Colour')]}
            standard={OPTION_GROUPS}
            onPick={(id) => setOpt(o.key, { c: id === 'none' ? undefined : id.toLowerCase() })}
          />
          <TextInput
            aria-label={`Option ${i + 1}`}
            className="min-w-0 flex-1"
            maxLength={DROPDOWN_OPTION_MAX}
            value={o.v}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => setOpt(o.key, { v: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOptAfter(o.key);
              }
            }}
          />
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Remove ${o.v || `Option ${i + 1}`}`}
            onClick={() => onChange(opts.filter((x) => x.key !== o.key))}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="xs" onClick={() => addOptAfter()}>
        Add Another Option
      </Button>
    </div>
  );
}
