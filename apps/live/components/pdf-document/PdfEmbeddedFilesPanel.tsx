'use client';

// The left panel's embedded files (docs/specs/035-pdf-documents/reading-surface.md "Embedded files"; security.md
// "Embedded files"): the files the PDF carries, listed by what it says of each, as text. A file is read out of the PDF
// only when a person saves or opens it, never past the limit; one whose name runs on a computer carries a warning
// line before Save; an embedded PDF opens as a new PDF document.
import { useEffect, useState } from 'react';
import type { EmbeddedFile, EmbeddedFiles, PdfEngine } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { UNNAMED_EMBEDDED_FILE } from '@/lib/pdf-document/open-embedded-pdf';
import { pdfSizeText } from '@/lib/pdf-document/pdf-pill';
import { track } from '@/lib/telemetry';

export const EMBEDDED_COPY = {
  reading: 'Reading embedded files…',
  none: 'This PDF has no embedded files.',
  cut: 'This PDF holds more embedded files than LiveDoc lists (500).',
  failed: 'The embedded files couldn’t be read.',
  runs: 'This file can run on a computer. Save it only if you trust where this PDF came from.',
  tooLarge: 'This file is larger than 100 MB, the most LiveDoc reads out of a PDF.',
  unreadable: 'This file couldn’t be read out of the PDF.',
} as const;

type Read = { phase: 'reading' } | { phase: 'failed' } | { phase: 'ready'; listed: EmbeddedFiles };

/** Whether a row offers Open: a name that ends in `.pdf`, or the type a PDF is. */
const looksLikePdf = (file: EmbeddedFile): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const BUTTON =
  'touch-target relative h-7 rounded-full border border-(--office-line) px-3 text-xs font-medium text-(--office-primary) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) disabled:opacity-40';

export function PdfEmbeddedFilesPanel({
  engine,
  onOpenPdf,
}: {
  engine: Pick<PdfEngine, 'embeddedFiles' | 'embeddedFile'>;
  /** Makes an embedded PDF a new PDF document and opens it; answers what to say where it could not. */
  onOpenPdf: (file: { name: string; bytes: Uint8Array<ArrayBuffer> }) => Promise<string | null>;
}) {
  const [read, setRead] = useState<Read>({ phase: 'reading' });
  // What is said on a row, by its place in the list, and the row being read out.
  const [said, setSaid] = useState<ReadonlyMap<number, string>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let gone = false;
    engine.embeddedFiles().then(
      (listed) => {
        if (!gone) setRead({ phase: 'ready', listed });
      },
      (error: unknown) => {
        debugLog('[pdf] embedded-list-failed', String(error));
        if (!gone) setRead({ phase: 'failed' });
      },
    );
    return () => {
      gone = true;
    };
  }, [engine]);

  if (read.phase === 'reading')
    return (
      <p role="status" className="px-2 py-2 text-sm text-(--office-muted)">
        {EMBEDDED_COPY.reading}
      </p>
    );
  if (read.phase === 'failed')
    return (
      <p role="alert" className="px-2 py-2 text-sm">
        {EMBEDDED_COPY.failed}
      </p>
    );
  const { files, cut } = read.listed;
  if (files.length === 0)
    return <p className="px-2 py-2 text-sm text-(--office-muted)">{EMBEDDED_COPY.none}</p>;

  const say = (at: number, words: string | null) =>
    setSaid((before) => {
      const next = new Map(before);
      if (words === null) next.delete(at);
      else next.set(at, words);
      return next;
    });

  // Reads a file out, then hands its bytes on; a refusal is said on its row.
  const readOut = async (at: number, then: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>) => {
    setBusy(at);
    say(at, null);
    try {
      const out = await engine.embeddedFile(at);
      if (!out.ok)
        return say(
          at,
          out.refusal === 'too_large' ? EMBEDDED_COPY.tooLarge : EMBEDDED_COPY.unreadable,
        );
      await then(out.bytes);
    } finally {
      setBusy(null);
    }
  };

  const save = (at: number, file: EmbeddedFile) =>
    readOut(at, async (bytes) => {
      downloadBlob(
        new Blob([bytes], { type: file.type || 'application/octet-stream' }),
        file.name || UNNAMED_EMBEDDED_FILE,
      );
      track('Pdf', 'Exported', 'EmbeddedFile');
    });

  const open = (at: number, file: EmbeddedFile) =>
    readOut(at, async (bytes) => say(at, await onOpenPdf({ name: file.name, bytes })));

  return (
    <>
      <ul aria-label="Embedded files" className="flex flex-col gap-1 py-1">
        {files.map((file, at) => (
          <li
            key={at}
            data-pdf-embedded-file={at}
            className="flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-(--office-hover)"
          >
            <span className="text-sm font-medium break-all">
              {file.name || UNNAMED_EMBEDDED_FILE}
            </span>
            <span className="text-xs text-(--office-muted)">
              {[file.size === null ? null : pdfSizeText(file.size), file.type || null]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {file.description ? <span className="text-xs">{file.description}</span> : null}
            {file.runs ? (
              <span data-pdf-embedded-runs className="text-xs text-(--office-ink)">
                {EMBEDDED_COPY.runs}
              </span>
            ) : null}
            <span className="mt-1 flex gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={busy !== null}
                aria-label={`Save ${file.name || UNNAMED_EMBEDDED_FILE}`}
                onClick={() => void save(at, file)}
              >
                Save
              </button>
              {looksLikePdf(file) ? (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy !== null}
                  aria-label={`Open ${file.name || UNNAMED_EMBEDDED_FILE}`}
                  onClick={() => void open(at, file)}
                >
                  Open
                </button>
              ) : null}
            </span>
            {said.has(at) ? (
              <span role="status" className="text-xs">
                {said.get(at)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {cut ? <p className="px-2 py-2 text-xs text-(--office-muted)">{EMBEDDED_COPY.cut}</p> : null}
    </>
  );
}
