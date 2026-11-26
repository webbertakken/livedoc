'use client';

// The composer's "Assign to <name>" checkbox (docs/specs/034-text-documents/review.md "Assigning"): under the field
// while the text names someone it mentions, unticked until the writer ticks it.

export function CommentAssignBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-supporting text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-icon-row shrink-0 accent-brand-600"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}
