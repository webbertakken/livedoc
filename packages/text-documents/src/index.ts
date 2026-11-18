// The text document (docs/specs/034-text-documents/text-document.md): its body, its live state, and its mapping onto
// the open standards, shared by the editor, the api, the MCP server and the CLI.
export { Body, type Paragraph } from './body';
export {
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_MAX_CHARS,
} from './limits';
export { BODY_FRAGMENT, TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from './text-document-state';
export {
  odfParagraphContent,
  readOdfText,
  writeFodt,
  writeOdt,
  type OdfTextRead,
} from './odf-text';
export {
  TEXT_DOCUMENT_FILE_TYPES,
  isTextDocumentFileType,
  type TextDocumentFileType,
} from './file-types';
export { base64OfBytes, bytesOfBase64 } from './base64';
