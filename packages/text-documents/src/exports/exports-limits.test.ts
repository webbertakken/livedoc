// docs/specs/034-text-documents/files-and-print.md "Downloading", against limits.ts: the longest text document a tab
// holds downloads in every export, each file well under the api's response budget.
import { describe, expect, it } from 'vitest';
import { TEXT_DOCUMENT_EXPORT_TYPES } from '../file-types';
import { TEXT_DOCUMENT_MAX_CHARS } from '../limits';
import { Paragraph } from '../model/blocks';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { writeTextDocumentExport } from './text-document-exports';

/** The most an export of the longest document may weigh (default: ten times its characters' worst case). */
const EXPORT_MAX_BYTES = 10 * 1024 * 1024;
const LINE =
  'The quick brown fox jumps over the lazy dog, again and again and again, ninety-nine chars. ';

describe('the exports of the longest document', () => {
  const blank = TextDocument.blank({ format: 'odf' });
  const normal = Styles.idOfRole(blank.styles, 'normal')!;
  const lines = Math.floor(TEXT_DOCUMENT_MAX_CHARS / LINE.length);
  const document = {
    ...blank,
    body: Array.from({ length: lines }, () => Paragraph.of(LINE, normal)),
  };

  it.each(TEXT_DOCUMENT_EXPORT_TYPES)('writes it as %s within the budget', (type) => {
    const bytes = writeTextDocumentExport(document, type, { when: new Date(0), identifier: 'x' });
    expect(bytes.byteLength).toBeGreaterThan(TEXT_DOCUMENT_MAX_CHARS * 0.9);
    expect(bytes.byteLength).toBeLessThan(EXPORT_MAX_BYTES);
  });
});
