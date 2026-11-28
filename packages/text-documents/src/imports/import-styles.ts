// The styles an imported document starts from (docs/specs/034-text-documents/files-and-print.md "Opening"): a blank
// ODF document's, with a code block's style added the first time a block of its language arrives.
import { CodeBlocks, type CodeBlockLanguage } from '../model/code-blocks';
import { Styles, type Style } from '../model/styles';
import { TextDocument } from '../model/text-document';

export type ImportStyles = {
  readonly blank: TextDocument;
  /** The styles so far: the blank document's, then each code block style added. */
  readonly styles: Style[];
  readonly normal: string;
  readonly heading: (level: number) => string;
  /** The style of a code block in `language`, added when the document has none. */
  readonly code: (language: CodeBlockLanguage | null) => string;
};

export function importStyles(): ImportStyles {
  const blank = TextDocument.blank({ format: 'odf' });
  const styles: Style[] = [...blank.styles];
  const code = (language: CodeBlockLanguage | null): string => {
    const held = CodeBlocks.held(styles, language);
    if (held) return held.id;
    // A language's style is based on the plain one, so that comes first.
    if (language) code(null);
    const style = CodeBlocks.style('odf', language, styles);
    styles.push(style);
    return style.id;
  };
  return {
    blank,
    styles,
    normal: Styles.idOfRole(styles, 'normal')!,
    heading: (level) =>
      Styles.idOfRole(styles, `heading${Math.min(6, Math.max(1, level))}` as 'heading1')!,
    code,
  };
}
