// The files a text document leaves as (docs/specs/034-text-documents/files-and-print.md "Downloading"), by extension.
// "File type" is the code's word only; copy names each file as the File > Download menu does.

export const TEXT_DOCUMENT_FILE_TYPES = ['odt', 'fodt', 'docx'] as const;
export type TextDocumentFileType = (typeof TEXT_DOCUMENT_FILE_TYPES)[number];

export function isTextDocumentFileType(value: unknown): value is TextDocumentFileType {
  return (TEXT_DOCUMENT_FILE_TYPES as readonly unknown[]).includes(value);
}
