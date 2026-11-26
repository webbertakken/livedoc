'use client';

// Manage stamps' Identity (docs/specs/035-pdf-documents/custom-stamps.md "Managing them", marks.md "Stamps"): the
// person's title, organisation, unit and email, each a field kept once left (Enter, Tab, a press elsewhere), Escape
// putting back what it held; an emptied field is kept as not set. Each field names its purpose for autofill.
import { useId, type FocusEvent, type KeyboardEvent } from 'react';
import {
  PDF_STAMP_IDENTITY_FIELD_MAX_CHARS,
  STAMP_IDENTITY_FIELDS,
  type StampIdentity,
  type StampIdentityField,
} from '@livedoc/pdf-documents';

/** Each field's label, input type and what autofill knows it as. */
const FIELDS: Readonly<
  Record<StampIdentityField, { label: string; type: 'text' | 'email'; autoComplete: string }>
> = {
  title: { label: 'Title', type: 'text', autoComplete: 'organization-title' },
  organisation: { label: 'Organisation', type: 'text', autoComplete: 'organization' },
  unit: { label: 'Unit', type: 'text', autoComplete: 'off' },
  email: { label: 'Email', type: 'email', autoComplete: 'email' },
};

const FIELD =
  'h-field min-w-0 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) pointer-coarse:h-11 pointer-coarse:text-base';

export function StampIdentityFields({
  identity,
  keep,
  onProblem,
}: {
  identity: StampIdentity;
  // Keeps one field; what to say where it could not be kept, else null.
  keep: (field: StampIdentityField, text: string) => string | null;
  onProblem: (problem: string | null) => void;
}) {
  const id = useId();
  const field = (name: StampIdentityField) => {
    const was = identity[name] ?? '';
    const { label, type, autoComplete } = FIELDS[name];
    return (
      <div key={name} className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-${name}`} className="text-body text-(--office-ink)">
          {label}
        </label>
        <input
          // Drawn again when the kept value changes elsewhere (another tab, another PDF).
          key={was}
          id={`${id}-${name}`}
          type={type}
          autoComplete={autoComplete}
          maxLength={PDF_STAMP_IDENTITY_FIELD_MAX_CHARS}
          defaultValue={was}
          className={FIELD}
          onBlur={(e: FocusEvent<HTMLInputElement>) => {
            if (e.currentTarget.value.trim() !== was) onProblem(keep(name, e.currentTarget.value));
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape' && e.currentTarget.value !== was) {
              // Puts the field back rather than closing the dialog.
              e.stopPropagation();
              e.currentTarget.value = was;
            }
          }}
        />
      </div>
    );
  };
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h3 id={`${id}-heading`} className="text-body font-medium text-(--office-ink)">
        Identity
      </h3>
      <p className="text-body text-(--office-ink)">
        Dynamic stamps you place show your title and organisation.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STAMP_IDENTITY_FIELDS.map(field)}
      </div>
    </section>
  );
}
