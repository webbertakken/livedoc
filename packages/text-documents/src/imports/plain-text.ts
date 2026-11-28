// Plain Text imported (docs/specs/034-text-documents/files-and-print.md "Opening"): a Normal text paragraph a line,
// its tabs kept, in a new ODF text document.
import { Paragraph } from '../model/blocks';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';

export function readPlainTextImport(text: string): TextDocument {
  const blank = TextDocument.blank({ format: 'odf' });
  const normal = Styles.idOfRole(blank.styles, 'normal')!;
  return { ...blank, body: text.split('\n').map((line) => Paragraph.of(line, normal)) };
}
