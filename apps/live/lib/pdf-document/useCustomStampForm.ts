'use client';

// Create custom stamp's fields (docs/specs/035-pdf-documents/custom-stamps.md "Making one"): a file chosen or dropped,
// kept as its picture in the browser (a PDF's page by its number, from 1); its name, the file's without its ending;
// its category, Custom until another is chosen or typed; and Create, which sends and makes it. Each refusal is said
// in the spec's words. A file chosen while another is kept wins: an older keep that settles late is dropped.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
  type CustomStampRecord,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import {
  keepPicture,
  stampNameOf,
  type KeptPicture,
  type PictureDrawing,
} from './custom-stamp-picture';
import { CUSTOM_STAMP_COPY, makeCustomStamp } from './make-custom-stamp';

/** (default) A new stamp's category, until another is chosen or typed. */
export const DEFAULT_STAMP_CATEGORY = 'Custom';

type Chosen = { readonly bytes: Uint8Array<ArrayBuffer>; readonly name: string };

export function useCustomStampForm<Held>({
  ownerId,
  drawing,
  onMade,
}: {
  ownerId: string;
  // The browser's drawing of pictures and pages (custom-stamp-drawing.ts), handed in so tests draw without one.
  drawing: PictureDrawing<Held>;
  onMade: (stamp: CustomStampRecord) => void;
}) {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [page, setPage] = useState(1);
  const [kept, setKept] = useState<KeptPicture | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(DEFAULT_STAMP_CATEGORY);
  const [problem, setProblem] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const latest = useRef(0);

  const keep = useCallback(
    async (bytes: Uint8Array<ArrayBuffer>, at: number) => {
      const asked = (latest.current += 1);
      setKeeping(true);
      setProblem(null);
      const result = await keepPicture(bytes, drawing, at - 1);
      if (asked !== latest.current) return;
      setKeeping(false);
      if (result.ok) setKept(result.picture);
      else {
        debugLog(`[pdf] custom-stamp-failed reason=${result.refusal}`);
        setKept(null);
        setProblem(CUSTOM_STAMP_COPY[result.refusal]);
      }
    },
    [drawing],
  );

  /** A file chosen or dropped: kept as a picture, its name the stamp's. */
  const choose = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setChosen({ bytes, name: file.name });
      setPage(1);
      setName(stampNameOf(file.name, PDF_CUSTOM_STAMP_NAME_MAX_CHARS));
      await keep(bytes, 1);
    },
    [keep],
  );

  /** A PDF's page by its number, from 1, within its pages. */
  const choosePage = useCallback(
    (to: number) => {
      const pages = kept?.pages ?? 1;
      const at = Math.min(Math.max(1, Math.round(to)), pages);
      if (!chosen || at === page || !Number.isFinite(at)) return;
      setPage(at);
      void keep(chosen.bytes, at);
    },
    [chosen, kept, page, keep],
  );

  const ready =
    kept !== null && !keeping && !making && name.trim() !== '' && category.trim() !== '';

  const create = useCallback(async () => {
    if (!ready || !kept) return;
    setMaking(true);
    setProblem(null);
    const made = await makeCustomStamp(ownerId, {
      picture: kept,
      name: name.trim(),
      category: category.trim(),
    });
    setMaking(false);
    if (made.ok) onMade(made.stamp);
    else setProblem(made.problem);
  }, [ready, kept, ownerId, name, category, onMade]);

  /** Everything forgotten: the dialog closed. */
  const reset = useCallback(() => {
    latest.current += 1;
    setChosen(null);
    setPage(1);
    setKept(null);
    setKeeping(false);
    setName('');
    setCategory(DEFAULT_STAMP_CATEGORY);
    setProblem(null);
    setMaking(false);
  }, []);

  const preview = useMemo(
    () =>
      kept ? URL.createObjectURL(new Blob([kept.bytes], { type: `image/${kept.type}` })) : null,
    [kept],
  );
  // Each preview's address let go once another replaces it, or the dialog goes.
  useEffect(() => (preview ? () => URL.revokeObjectURL(preview) : undefined), [preview]);

  return {
    fileName: chosen?.name ?? null,
    kept,
    keeping,
    preview,
    page,
    choosePage,
    name,
    setName: (to: string) => setName(to.slice(0, PDF_CUSTOM_STAMP_NAME_MAX_CHARS)),
    category,
    setCategory: (to: string) => setCategory(to.slice(0, PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS)),
    problem,
    making,
    ready,
    choose,
    create,
    reset,
  };
}
