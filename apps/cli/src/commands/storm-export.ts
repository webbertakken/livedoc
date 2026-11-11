// `storm export` (docs/specs/021-event-storming/domain-export.md "The CLI"): the board's domain export bundle, written
// into <to>/.livedoc/storm/<board>/ beside any earlier one, which it reads first for CHANGES.md and the language. The
// agent driving the CLI is the model: it follows CONVERT.md to write the spec and the types into the repository.

import { posix } from 'node:path';
import { documentOf, readStorm, VerbRefusal, type VerbContext } from '@livedoc/agent-verbs';
import {
  buildExportBundle,
  bundleFolderName,
  detectDomainLanguage,
  DOMAIN_EXPORT_LANGUAGES,
  hasChanges,
  parseManifest,
  parsePreviousReading,
  type DomainLanguage,
} from '@livedoc/storm-reading';
import { CLI_VERSION } from '../config/version';
import type { CliIo } from '../io';

export type StormExportInput = { doc: string; tab?: string; to: string; lang?: DomainLanguage };

const BUNDLE_ROOT = '.livedoc/storm';

export async function stormExport(io: CliIo, ctx: VerbContext, input: StormExportInput) {
  const document = await documentOf(ctx, input.doc);
  const read = await readStorm(ctx.api, document, input.tab);
  if (!read.ok)
    throw new VerbRefusal({
      status: read.code === 'tab_not_found' ? 404 : 400,
      code: read.code,
      message: read.message,
      hint: 'read the board with: livedoc storm read <doc>',
    });
  const root = posix.resolve(io.cwd, input.to);
  const dir = `${root}/${BUNDLE_ROOT}/${bundleFolderName(read.tabName, read.tabId)}`;
  const [previousText, manifestText] = await Promise.all([
    io.files.read(`${dir}/storm.json`),
    io.files.read(`${dir}/export.json`),
  ]);
  const previous = previousText === null ? null : parsePreviousReading(previousText);
  if (previousText !== null && previous === null)
    ctx.notice(`${dir}/storm.json is not a reading; exporting as a first export`);
  const { language, because } = await languageOf(io, root, input.lang, manifestText);
  ctx.log(`storm export ${read.documentId}/${read.tabId} to ${dir} as ${language} (${because})`);

  const bundle = buildExportBundle({
    reading: read.reading,
    previous,
    language,
    because,
    board: { documentId: read.documentId, tabId: read.tabId, name: read.tabName, rev: read.rev },
    livedoc: CLI_VERSION,
    exportedAt: new Date(io.now()).toISOString(),
  });
  await io.files.mkdir(dir);
  for (const [name, text] of Object.entries(bundle.files))
    await io.files.write(`${dir}/${name}`, text);
  // A CHANGES.md from an earlier export would describe changes this one did not see.
  if (!bundle.files['CHANGES.md'] && (await io.files.read(`${dir}/CHANGES.md`)) !== null)
    await io.files.remove(`${dir}/CHANGES.md`);
  const changes = bundle.changes;
  return {
    dir,
    language,
    because,
    notes: read.reading.notes.length,
    gaps: read.reading.gaps.length,
    changes:
      changes === null ? null : hasChanges(changes) ? Object.values(changes).flat().length : 0,
    files: Object.keys(bundle.files),
  };
}

// --lang, else the language of the last export there, else the one language the repository's root names.
async function languageOf(
  io: CliIo,
  root: string,
  lang: DomainLanguage | undefined,
  manifestText: string | null,
): Promise<{ language: DomainLanguage; because: string }> {
  if (lang) return { language: lang, because: '--lang' };
  const manifest = manifestText === null ? null : parseManifest(manifestText);
  if (manifest?.language) return { language: manifest.language, because: 'the last export' };
  const entries = (await io.files.list(root)) ?? [];
  const verdict = detectDomainLanguage(entries.filter((e) => e.kind === 'file').map((e) => e.name));
  if (verdict.language) return { language: verdict.language, because: verdict.because };
  throw new VerbRefusal({
    status: 400,
    code: 'language_unclear',
    message:
      verdict.candidates.length === 0
        ? `nothing at ${root} says which language the types are in`
        : `${root} holds ${verdict.candidates.join(' and ')} projects`,
    lines: [`languages: ${DOMAIN_EXPORT_LANGUAGES.join(', ')}`],
    hint: `choose one with --lang ${verdict.candidates[0] ?? 'typescript'}`,
  });
}
