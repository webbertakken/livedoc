// The files a text document leaves as (docs/specs/034-text-documents/files-and-print.md "Downloading"), by extension.
// "File type" is the code's word only; copy names each file as the File > Download menu does.

export const TEXT_DOCUMENT_FILE_TYPES = ['odt', 'fodt', 'docx'] as const;
export type TextDocumentFileType = (typeof TEXT_DOCUMENT_FILE_TYPES)[number];

export function isTextDocumentFileType(value: unknown): value is TextDocumentFileType {
  return (TEXT_DOCUMENT_FILE_TYPES as readonly unknown[]).includes(value);
}

/** The files written from the model that no LiveDoc file type reads back as itself. */
export const TEXT_DOCUMENT_EXPORT_TYPES = ['txt', 'md', 'html', 'epub', 'rtf'] as const;
export type TextDocumentExportType = (typeof TEXT_DOCUMENT_EXPORT_TYPES)[number];

export function isTextDocumentExportType(value: unknown): value is TextDocumentExportType {
  return (TEXT_DOCUMENT_EXPORT_TYPES as readonly unknown[]).includes(value);
}

/** The exports that carry their pictures' bytes: their callers read gallery media and draw drawings first. */
export const PICTURED_EXPORT_TYPES = [
  'html',
  'epub',
  'rtf',
] as const satisfies readonly TextDocumentExportType[];
export type PicturedExportType = (typeof PICTURED_EXPORT_TYPES)[number];

export function isPicturedExportType(value: unknown): value is PicturedExportType {
  return (PICTURED_EXPORT_TYPES as readonly unknown[]).includes(value);
}

/** Each export's file extension: the Web Page leaves zipped with its pictures. */
export const EXPORT_EXTENSIONS: Readonly<Record<TextDocumentExportType, string>> = {
  txt: 'txt',
  md: 'md',
  html: 'zip',
  epub: 'epub',
  rtf: 'rtf',
};

/** Every file a text document downloads as: its own formats', and the exports. */
export type TextDocumentDownloadType = TextDocumentFileType | TextDocumentExportType;
