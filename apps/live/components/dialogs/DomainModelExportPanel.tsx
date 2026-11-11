'use client';

// The Export dialog's Domain Model panel (docs/specs/021-event-storming/domain-export.md "The zip"): the language,
// an earlier export to update, what the zip will hold (said before the export, never after), then the export, which
// may take a minute when the deployment's model writes the spec and the types, with progress and a cancel.
import { useId, useRef, useState } from 'react';
import { Button, Select } from '@livedoc/ui';
import type { Tab } from '@livedoc/document';
import { LANGUAGE_IDIOMS, type DomainLanguage } from '@livedoc/storm-reading';
import { BackBar } from '@/components/primitives/BackBar';
import { useCapabilities } from '@/hooks/persistence/useCapabilities';
import {
  DOMAIN_EXPORT_LANGUAGES,
  domainExportZip,
  readEarlierExport,
  rememberLanguage,
  rememberedLanguage,
  requestDomainExport,
} from '@/lib/domain-export';
import { downloadBlob } from '@/lib/export-tab';
import { sanitizeFilename } from '@/lib/export-pages';
import { track } from '@/lib/telemetry';

// What each refusal says, in the person's words, with what to do next.
const ERRORS: Record<string, string> = {
  previous_unreadable:
    'That file is not a zip this export can read. Choose the zip an earlier export made.',
  previous_invalid:
    'That zip is not an earlier domain export: it has no board reading in its livedoc folder.',
  previous_too_large: 'That earlier export is larger than an export can update (2 MB of text).',
  board_too_large: 'This board has more notes than one export takes (400). Split it across tabs.',
  ai_failed: 'The model could not write the spec and the types this time.',
  ai_not_configured: 'This deployment has no model to write the spec and the types.',
  rate_limited: 'Too many exports at once. Try again in a minute.',
};
const errorText = (code: string) => ERRORS[code] ?? 'The export failed. Try again.';

const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

type Run = { phase: 'idle' } | { phase: 'running' } | { phase: 'failed'; error: string };

export function DomainModelExportPanel({
  tab,
  documentName,
  context,
  onDone,
  onBack,
}: {
  tab: Tab;
  documentName: string;
  // Who asks, for which document, through which share link.
  context: { ownerId: string; documentId: string; shareCode: string | null };
  onDone: () => void;
  onBack: () => void;
}) {
  const { aiEnabled } = useCapabilities();
  const languageId = useId();
  const fileId = useId();
  const [language, setLanguage] = useState<DomainLanguage>(() =>
    rememberedLanguage(tab.id, storage()),
  );
  const [earlier, setEarlier] = useState<{ name: string; files: Record<string, string> } | null>(
    null,
  );
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const running = run.phase === 'running';

  const pickEarlier = async (file: File | undefined) => {
    if (!file) return setEarlier(null);
    const read = await readEarlierExport(new Uint8Array(await file.arrayBuffer()));
    if (!read.ok) {
      setEarlier(null);
      setRun({ phase: 'failed', error: read.error });
      return;
    }
    setRun({ phase: 'idle' });
    setEarlier({ name: file.name, files: read.files });
  };

  const exportZip = async (modelWrites: boolean) => {
    const controller = new AbortController();
    abort.current = controller;
    setRun({ phase: 'running' });
    rememberLanguage(tab.id, language, storage());
    try {
      const result = await requestDomainExport({
        ...context,
        share: context.shareCode,
        tabId: tab.id,
        language,
        previous: earlier?.files ?? null,
        signal: controller.signal,
        bundleOnly: !modelWrites,
      });
      if (!result.ok) {
        console.warn('[storm-export] refused', { error: result.error });
        setRun({ phase: 'failed', error: result.error });
        return;
      }
      const name = sanitizeFilename(
        `${documentName || 'document'} - ${tab.name || 'board'} - Domain Model`,
      );
      downloadBlob(domainExportZip(result.files), `${name}.zip`);
      track('Document', 'Exported', result.written ? 'DomainModel' : 'DomainModelBundle');
      onDone();
    } catch (err) {
      if (controller.signal.aborted) setRun({ phase: 'idle' });
      else {
        console.warn('[storm-export] failed', err);
        setRun({ phase: 'failed', error: 'export_failed' });
      }
    } finally {
      abort.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <BackBar label="All formats" current="Domain Model" onClick={onBack} disabled={running} />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {aiEnabled
          ? 'A spec of the domain and its types, written from this board by the model, with the board reading beside them, in one .zip.'
          : 'The board reading and the brief that turns it into a spec and types, in one .zip. This deployment has no model: hand the brief to a coding agent working in your repository.'}
      </p>
      <label
        htmlFor={languageId}
        className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
      >
        Types in
        <Select
          id={languageId}
          size="sm"
          className="min-w-0 flex-1"
          value={language}
          disabled={running}
          onChange={(e) => setLanguage(e.target.value as DomainLanguage)}
        >
          {DOMAIN_EXPORT_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_IDIOMS[l].name}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-200">
        <label htmlFor={fileId}>Update an earlier export (optional)</label>
        <input
          id={fileId}
          type="file"
          accept=".zip,application/zip"
          disabled={running}
          onChange={(e) => void pickEarlier(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700 dark:file:border-slate-700 dark:file:bg-slate-900 dark:file:text-slate-200"
        />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {earlier
            ? `Changes the spec and types in ${earlier.name} to match the board, keeping what people wrote by hand.`
            : 'Without one, the export starts a new spec and types.'}
        </p>
      </div>
      {running ? (
        <p role="status" className="text-sm text-slate-700 dark:text-slate-200">
          {aiEnabled
            ? 'Writing the spec and the types… this can take a minute.'
            : 'Making the zip…'}
        </p>
      ) : null}
      {run.phase === 'failed' ? (
        <div role="alert" className="flex flex-col gap-2 text-sm text-rose-700 dark:text-rose-400">
          <p>{errorText(run.error)}</p>
          {run.error === 'ai_failed' ? (
            <div>
              <Button size="sm" variant="secondary" onClick={() => void exportZip(false)}>
                Download the Board Reading Only
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {running ? (
          <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" onClick={() => void exportZip(aiEnabled)} disabled={running}>
          {running ? 'Exporting…' : 'Export .zip'}
        </Button>
      </div>
    </div>
  );
}
