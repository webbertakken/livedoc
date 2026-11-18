// A downloaded file's name (docs/specs/029-sheets/files-and-print.md, docs/specs/034-text-documents/files-and-print.md):
// the document's name, safe in a file system and a Content-Disposition header, with its format's extension.

// Characters a file name or a Content-Disposition header cannot carry: controls and the path and quoting ones.
const UNSAFE_IN_FILE_NAME = new Set(['"', '\\', '/', ':', '*', '?', '<', '>', '|']);
const safeInFileName = (char: string) => char >= ' ' && !UNSAFE_IN_FILE_NAME.has(char);

/** The document's name as a file name, or `untitled` when nothing of it is left. */
export function downloadFileName(name: string, extension: string, untitled: string): string {
  const kept = [...name].map((char) => (safeInFileName(char) ? char : ' ')).join('');
  const base = kept.replace(/\s+/g, ' ').trim().slice(0, 120) || untitled;
  return `${base}.${extension}`;
}
