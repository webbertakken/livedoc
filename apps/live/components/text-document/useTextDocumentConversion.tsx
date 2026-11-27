'use client';

// A text document's conversion, as a person's choice (docs/specs/034-text-documents/standard-mapping.md "Conversion",
// files-and-print.md "Downloading"): the dialog lists what the other format cannot hold, read here from the live
// state, and only then converts (one undo step) or downloads a converted copy. The document's own format downloads
// without asking.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  conversionLead,
  conversionLines,
  conversionLosses,
  conversionTitle,
  TextDocumentState,
  type ConversionLoss,
  type ConversionPurpose,
  type TextDocumentFileType,
} from '@livedoc/text-documents';
import { OfficeConversionDialog } from '@/components/office/OfficeConversionDialog';
import { useLatest } from '@/hooks/ui/useLatest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  textDocumentConversion,
  type TextDocumentConversion,
} from '@/lib/text-document/text-document-conversion';

export const CONVERT_FAILED = 'The document could not be converted. Try again.';
export const NOT_READY = 'The document is still loading. Try again in a moment.';

const FORMAT_OF: Record<TextDocumentFileType, TextDocumentFormat> = {
  odt: 'odf',
  fodt: 'odf',
  docx: 'ooxml',
};

type Open = {
  readonly purpose: ConversionPurpose;
  readonly to: TextDocumentFormat;
  readonly type: TextDocumentFileType;
  readonly losses: readonly ConversionLoss[];
};

export type TextDocumentConversionDeps = {
  readonly format: TextDocumentFormat;
  /** The live state, null until it is loaded. */
  readonly doc: () => Y.Doc | null;
  /** The body's undo manager, null until the writing is bound. */
  readonly undoManager: () => Y.UndoManager | null;
  /** Names the tab's format; null where the person may not convert. */
  readonly setFormat: ((format: TextDocumentFormat) => void) | null;
  readonly download: (type: TextDocumentFileType) => Promise<void> | void;
  readonly setProblem: (problem: string | null) => void;
};

export function useTextDocumentConversion(deps: TextDocumentConversionDeps): {
  /** Downloads `type`: at once in the document's own format, after the dialog in the other. */
  readonly download: (type: TextDocumentFileType) => void;
  /** Opens the dialog to convert to the other format; nothing where the person may not convert. */
  readonly convert: (() => void) | null;
  readonly dialog: ReactNode;
} {
  const [open, setOpen] = useState<Open | null>(null);
  const live = useLatest(deps);
  // The conversion follows the body's undo manager for as long as both live: an undo after it flips the format back.
  const held = useRef<{
    doc: Y.Doc;
    manager: Y.UndoManager;
    conversion: TextDocumentConversion;
  } | null>(null);
  useEffect(
    () => () => {
      held.current?.conversion.destroy();
      held.current = null;
    },
    [],
  );

  // Stable while whether the person may convert stays: the title row's actions hold them.
  const canConvert = deps.setFormat !== null;
  const doors = useMemo(() => {
    const ask = (purpose: ConversionPurpose, type: TextDocumentFileType) => {
      const { doc, format, setProblem } = live.current;
      const state = doc();
      if (!state) {
        setProblem(NOT_READY);
        debugLog('[text-document] conversion refused', { reason: 'not loaded' });
        return;
      }
      const to = FORMAT_OF[type];
      setProblem(null);
      setOpen({
        purpose,
        to,
        type,
        losses: conversionLosses(TextDocumentState.document(state, format), to),
      });
    };
    return {
      download: (type: TextDocumentFileType) => {
        if (FORMAT_OF[type] === live.current.format) void live.current.download(type);
        else ask('download', type);
      },
      convert: canConvert
        ? () => ask('convert', live.current.format === 'odf' ? 'docx' : 'odt')
        : null,
    };
  }, [canConvert, live]);

  const conversionFor = (doc: Y.Doc, manager: Y.UndoManager): TextDocumentConversion => {
    const now = held.current;
    if (now && now.doc === doc && now.manager === manager) return now.conversion;
    now?.conversion.destroy();
    const conversion = textDocumentConversion(doc, manager, (format) =>
      live.current.setFormat?.(format),
    );
    held.current = { doc, manager, conversion };
    return conversion;
  };

  const confirm = () => {
    if (!open) return;
    setOpen(null);
    const { doc, undoManager, format, download, setProblem } = live.current;
    if (open.purpose === 'download') {
      void download(open.type);
      return;
    }
    const state = doc();
    const manager = undoManager();
    if (!state || !manager) {
      setProblem(NOT_READY);
      debugLog('[text-document] convert failed', { reason: 'not bound' });
      return;
    }
    const started = performance.now();
    try {
      const losses = conversionFor(state, manager).convert(format, open.to);
      track('Document', 'Changed', 'TextDocumentConverted');
      debugLog('[text-document] converted', {
        from: format,
        to: open.to,
        losses: losses.length,
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      setProblem(CONVERT_FAILED);
      debugLog('[text-document] convert failed', { error: String(error) });
    }
  };

  const view = open
    ? {
        phase: 'listed' as const,
        title: conversionTitle(open.purpose, open.to),
        action: open.purpose === 'convert' ? 'Convert' : 'Download',
        lead: conversionLead(open.to, open.losses),
        lines: conversionLines(open.losses),
      }
    : null;

  return {
    ...doors,
    dialog: (
      <OfficeConversionDialog
        view={view}
        onConfirm={confirm}
        onRetry={() => setOpen(null)}
        onCancel={() => setOpen(null)}
      />
    ),
  };
}
