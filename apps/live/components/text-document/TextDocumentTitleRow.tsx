'use client';

// The text document's title row in its bare form (docs/specs/034-text-documents/editing-surface.md "The title row"):
// the name, its format, and a File menu holding Open and Download.
import { useRef, useState } from 'react';
import { Tooltip } from '@livedoc/ui';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { apiDownloadTextDocument } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { openTextDocumentFile } from '@/lib/text-document/open-text-document-file';

export function TextDocumentTitleRow({
  scope,
  documentName,
}: {
  scope: TextDocumentScope;
  documentName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const download = async () => {
    setMenuOpen(false);
    try {
      const { blob, fileName } = await apiDownloadTextDocument(scope, 'odt');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      track('Document', 'Exported', 'TextDocumentOdt');
    } catch (error) {
      setProblem('The file could not be downloaded. Try again.');
      debugLog('[text-document] download failed', { error: String(error) });
    }
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const opened = await openTextDocumentFile(scope.ownerId, file);
    if (opened.ok) window.location.assign(`/document/${opened.documentId}`);
    else setProblem(opened.message);
  };

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-950">
      <h1 className="truncate text-lg text-slate-900 dark:text-slate-50">
        {documentName || 'Untitled document'}
      </h1>
      <Tooltip label="OpenDocument format">
        <span
          role="img"
          aria-label="OpenDocument format"
          className="rounded border border-slate-300 px-1.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          .ODT
        </span>
      </Tooltip>
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
            className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                picker.current?.click();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void download()}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Download as OpenDocument (.odt)
            </button>
          </div>
        ) : null}
        <input
          ref={picker}
          type="file"
          accept=".odt,.fodt,application/vnd.oasis.opendocument.text"
          aria-label="Open a file"
          className="hidden"
          onChange={(e) => void open(e.target.files?.[0])}
        />
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      ) : null}
    </header>
  );
}
