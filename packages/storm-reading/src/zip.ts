// The zip export (docs/specs/021-event-storming/domain-export.md "The zip"): the earlier zip read back, the messages
// that ask the deployment's model to write the spec and the types, its answer read safely, and the layout the
// editor writes. Pure: the api route calls the model, the editor reads and writes the archive.

import { parseManifest, parsePreviousReading, type Bundle, type ExportManifest } from './bundle';
import { LANGUAGE_IDIOMS } from './brief/languages';
import type { StormReading } from './types';

// The most notes a board may have for the zip export: past it the model's context and the answer's length are no
// longer comfortable. Safe range: 100 to 1000.
export const DOMAIN_EXPORT_MAX_NOTES = 400;
// The folder the bundle sits in inside the zip.
export const ZIP_BUNDLE_FOLDER = 'livedoc';
// The most text an earlier zip may hand back, summed over its files (UTF-16 code units, close enough to bytes for
// the source text an export holds). Safe range: 256 KB to 4 MB; the model's context bounds it above.
export const DOMAIN_EXPORT_MAX_PREVIOUS_BYTES = 2 * 1024 * 1024;
// The most files one model answer may write. Safe range: 20 to 200.
export const DOMAIN_EXPORT_MAX_WRITTEN_FILES = 80;

const TRACE_PATH = `${ZIP_BUNDLE_FOLDER}/trace.json`;
const BASELINE_PATH = `${ZIP_BUNDLE_FOLDER}/storm.json`;
const MANIFEST_PATH = `${ZIP_BUNDLE_FOLDER}/export.json`;

export type PreviousExport =
  | {
      ok: true;
      reading: StormReading;
      manifest: ExportManifest | null;
      // The trace and every spec and source file, for the model to change rather than replace.
      sources: Record<string, string>;
    }
  | { ok: false; error: 'previous_invalid' | 'previous_too_large' };

// An earlier zip's text files, by path, read back into what the next export iterates from.
export function previousExport(files: Record<string, string>): PreviousExport {
  const size = Object.values(files).reduce((sum, text) => sum + text.length, 0);
  if (size > DOMAIN_EXPORT_MAX_PREVIOUS_BYTES) return { ok: false, error: 'previous_too_large' };
  const baseline = files[BASELINE_PATH];
  const reading = baseline === undefined ? null : parsePreviousReading(baseline);
  if (!reading) return { ok: false, error: 'previous_invalid' };
  const manifestText = files[MANIFEST_PATH];
  const sources = Object.fromEntries(
    Object.entries(files).filter(([path]) => isWritablePath(path)),
  );
  return {
    ok: true,
    reading,
    manifest: manifestText === undefined ? null : parseManifest(manifestText),
    sources,
  };
}

const ANSWER_FORMAT = `## Answer format (this export)

You have no repository and no tools here: the earlier export's spec and code, when there is one, are given below.
Answer with ONE JSON object and nothing else:

{ "files": [ { "path": "docs/specs/NNN-<context>/<subject>.md", "content": "…" }, … ] }

- Every file you write or change, whole: the spec files, the spec indexes, the types, and \`${TRACE_PATH}\`.
- Paths are relative, with forward slashes: under \`docs/specs/\` for the spec, the source tree for the types.
  Never \`..\`, never an absolute path, never \`${ZIP_BUNDLE_FOLDER}/\` except \`${TRACE_PATH}\`.
- At most ${DOMAIN_EXPORT_MAX_WRITTEN_FILES} files. A file of the earlier export you leave out stays as it was.
- You cannot run a formatter or a type checker: write as they would leave it.`;

type ChatMessage = { role: 'system' | 'user'; content: string };

// The messages that ask the model to write: the brief and the answer format, then the bundle and the earlier export.
export function writeMessages(
  bundle: Bundle,
  previousSources: Record<string, string>,
): ChatMessage[] {
  const given = Object.entries(bundle.files)
    .filter(([name]) => name !== 'CONVERT.md')
    .map(([name, text]) => `## ${name}\n\n${text}`);
  const earlier = Object.entries(previousSources).map(([path, text]) => `### ${path}\n\n${text}`);
  return [
    { role: 'system', content: `${bundle.files['CONVERT.md']}\n${ANSWER_FORMAT}\n` },
    {
      role: 'user',
      content: [...given, ...(earlier.length > 0 ? ['## Earlier export', ...earlier] : [])].join(
        '\n\n',
      ),
    },
  ];
}

// May the model write this path? Relative, forward slashes, no `.` or `..` segment, not the bundle (but the trace),
// and not the zip's own README.
function isWritablePath(path: string): boolean {
  if (path === TRACE_PATH) return true;
  if (path === '' || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\\'))
    return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  if (segments[0] === ZIP_BUNDLE_FOLDER) return false;
  return segments.length > 1;
}

export type WrittenFiles =
  { ok: true; files: Record<string, string>; dropped: string[] } | { ok: false };

// An answer wrapped in a Markdown code fence, unwrapped; string work rather than a pattern, so a long run of
// whitespace costs linear time whatever the model sends.
function unfenced(text: string): string {
  if (!text.startsWith('```') || !text.endsWith('```') || text.length < 6) return text;
  const firstLine = text.indexOf('\n');
  return text.slice(firstLine < 0 ? 3 : firstLine + 1, -3).trim();
}

// The model's answer, read safely: the files it wrote at paths it may write, at most the cap. An answer that is no
// such JSON, or writes nothing, is no answer.
export function parseWrittenFiles(answer: string): WrittenFiles {
  const text = unfenced(answer.trim());
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const list = (value as { files?: unknown } | null)?.files;
  if (!Array.isArray(list)) return { ok: false };
  const files: Record<string, string> = {};
  const dropped: string[] = [];
  for (const entry of list as { path?: unknown; content?: unknown }[]) {
    const path = typeof entry.path === 'string' ? entry.path : '';
    const writable = isWritablePath(path) && typeof entry.content === 'string';
    if (!writable || Object.keys(files).length >= DOMAIN_EXPORT_MAX_WRITTEN_FILES)
      dropped.push(path);
    else files[path] = entry.content as string;
  }
  return Object.keys(files).length > 0 ? { ok: true, files, dropped } : { ok: false };
}

function readme(bundle: Bundle, written: boolean): string {
  const { board, language } = bundle.manifest;
  const lines = [
    `# ${board.name || 'Event Storming board'}: domain export`,
    '',
    `Exported from LiveDoc on ${bundle.manifest.exportedAt}.`,
    '',
    `- \`${ZIP_BUNDLE_FOLDER}/\`: the board reading (\`storm.json\`, \`storm.md\`), the brief (\`CONVERT.md\`) and the manifest.`,
  ];
  if (written)
    lines.push(
      `- \`docs/specs/\` and the source tree: the spec and the ${language ? `${LANGUAGE_IDIOMS[language].name} ` : ''}types, written by the deployment's model`,
      "  following `CONVERT.md`. Review them as you would a colleague's first draft.",
      '',
      'To update them after the board changes, export again and choose this zip under "Update an earlier export".',
    );
  else
    lines.push(
      '',
      `Hand \`${ZIP_BUNDLE_FOLDER}/CONVERT.md\` to a coding agent working in your repository: it writes the spec and the`,
      'types there, and keeps `storm.json` as the baseline for the next export.',
    );
  return `${lines.join('\n')}\n`;
}

// The zip's files in the order they are written: the README, the bundle under `livedoc/`, then what the model wrote.
export function zipFiles(
  bundle: Bundle,
  written: Record<string, string> | null,
): Record<string, string> {
  return {
    'README.md': readme(bundle, written !== null),
    ...Object.fromEntries(
      Object.entries(bundle.files).map(([name, text]) => [`${ZIP_BUNDLE_FOLDER}/${name}`, text]),
    ),
    ...written,
  };
}
