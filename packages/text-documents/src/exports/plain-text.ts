// Download as Plain Text (docs/specs/034-text-documents/files-and-print.md "Downloading"): one line per paragraph,
// UTF-8, each list item after its marker as drawn, a table's cells side by side split by tabs, a picture as its alt text
// in brackets, an equation in its linear form, and the footnotes after the writing, numbered as they are drawn. With
// more than one document tab, each tab's name heads its writing.
import type { Block, Inline, Paragraph } from '../model/blocks';
import { Equations } from '../model/equations';
import type { Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { exportContext, exportTabs, tabsTitled, type ExportContext } from './export-walk';

/** A picture in a line of text: its alt text, else its title, in brackets; a decorative one is nothing. */
export function pictureText(alt: string | undefined, title: string | undefined): string {
  const said = (alt ?? title ?? '').trim();
  return said ? `[${said}]` : '[Picture]';
}

/** An inline's text: a run's and a field's as shown, a note's number, an object's stand-in, nothing for marks. */
function inlineText(context: ExportContext, inline: Inline): string {
  switch (inline.type) {
    case 'run':
    case 'field':
      return inline.text;
    case 'note':
      return `[${context.notes.get(inline) ?? ''}]`;
    case 'picture':
      return inline.decorative ? '' : pictureText(inline.alt, inline.title);
    case 'equation':
      return Equations.linear(inline.math);
    default:
      return '';
  }
}

/** A paragraph's text, after its list marker, a line break kept as a new line. */
function paragraphLine(context: ExportContext, paragraph: Paragraph): string {
  const text = paragraph.inlines.map((i) => inlineText(context, i)).join('');
  const marker = context.markers.get(paragraph);
  if (!marker) return text;
  const indent = '  '.repeat(marker.level);
  const lead = marker.kind === 'check' ? (marker.checked ? '☑' : '☐') : marker.text;
  return `${indent}${lead} ${text}`;
}

/** A table: one line a row, its cells split by tabs, a cell's paragraphs joined by spaces. */
function tableLines(context: ExportContext, table: Table): string[] {
  return table.rows.map((row) =>
    row.cells
      .map((cell) =>
        blockLines(context, cell.blocks)
          .filter((line) => line !== '')
          .join(' ')
          .replace(/[\t\n]/g, ' '),
      )
      .join('\t'),
  );
}

function blockLines(context: ExportContext, blocks: readonly Block[]): string[] {
  return blocks.flatMap((block): string[] => {
    switch (block.type) {
      case 'paragraph':
        return [paragraphLine(context, block)];
      case 'table':
        return tableLines(context, block);
      case 'contents':
        return block.entries.map((entry) => paragraphLine(context, entry));
      case 'section':
        return [''];
      default:
        return [];
    }
  });
}

/** The document as plain text. */
export function writePlainText(document: TextDocument): string {
  const context = exportContext(document);
  const tabs = exportTabs(document);
  const titled = tabsTitled(tabs);
  const lines = tabs.flatMap((tab, i) => [
    ...(titled ? [...(i > 0 ? [''] : []), tab.name] : []),
    ...blockLines(context, tab.body),
  ]);
  const notes = [...context.notes].map(
    ([note, n]) =>
      `[${n}] ${blockLines(context, note.blocks)
        .filter((l) => l !== '')
        .join(' ')}`,
  );
  return [...lines, ...(notes.length > 0 ? ['', ...notes] : [])].join('\n') + '\n';
}
