'use client';

// An office document's title row in its bare form (docs/specs/004-interface-design/office-shell.md "Title row"): the
// name, the file format it keeps, and a File menu holding Open and its downloads. The office shell takes its place;
// until then every kind outside the canvas draws this one.
import { useRef, useState } from 'react';

export type OfficeFileItem = { label: string; run: () => Promise<void> | void };

export function OfficeTitleRow({
  name,
  format,
  formatTitle,
  openAccept,
  onOpenFile,
  items,
  problem,
}: {
  name: string;
  // The format's pill (".ODS") and what it is called ("OpenDocument format").
  format: string;
  formatTitle: string;
  // The file picker's types, and what opening a picked file does; absent hides Open.
  openAccept?: string;
  onOpenFile?: (file: File) => void;
  items: readonly OfficeFileItem[];
  problem: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);
  const itemClass =
    'block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800';
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-950">
      <h1 className="truncate text-lg text-slate-900 dark:text-slate-50">{name}</h1>
      <span
        className="rounded border border-slate-300 px-1.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        title={formatTitle}
      >
        {format}
      </span>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded px-2 py-1 text-sm text-slate-800 hover:bg-slate-100 focus-visible:outline-2 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          File
        </button>
        {menuOpen ? (
          <div
            role="menu"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false);
            }}
            className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {onOpenFile ? (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setMenuOpen(false);
                  picker.current?.click();
                }}
              >
                Open
              </button>
            ) : null}
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setMenuOpen(false);
                  void item.run();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {onOpenFile ? (
          <input
            ref={picker}
            type="file"
            accept={openAccept}
            aria-label="Open a file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onOpenFile(file);
            }}
          />
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      ) : null}
    </header>
  );
}
