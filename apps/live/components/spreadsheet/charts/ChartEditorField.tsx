'use client';

// A labelled control of the Chart Editor (docs/specs/029-sheets/charts.md "Chart Editor"): its name over it.
import type { ReactNode } from 'react';

export function ChartEditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-supporting text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
