// The text document's menus (docs/specs/034-text-documents/editing-surface.md "The menu bar"): Google Docs' menus in
// Google's order and words, less the rows the parity matrix leaves out, plus LiveDoc's own (Convert, the flat file,
// Agents). Each item names the least share level that sees it; an item whose phase has not landed is `comingSoon`.
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  contextEntries,
  type OfficeCatalogue,
  type OfficeEntry,
  type OfficeItem,
  type OfficeMenu,
} from '@/lib/office/office-catalogue';
import {
  PARAGRAPH_STYLE_ITEMS,
  paragraphStyleEntries,
  STYLE_OPTIONS,
} from './text-document-paragraph-styles';
import { BORDERS_ITEM, LINE_SPACING_ENTRIES } from './text-document-paragraph-actions';
import { PAGE_NUMBER_PRESETS } from './text-document-page-numbers';

type ItemOptions = Partial<
  Pick<OfficeItem, 'shortcut' | 'shortcutArg' | 'keywords' | 'checkable' | 'status' | 'sizeGrid'>
>;

const item = (
  id: string,
  label: string,
  level: AccessLevel,
  options: ItemOptions = {},
): OfficeItem => ({ kind: 'item', id, label, level, status: 'comingSoon', ...options });

const submenu = (id: string, label: string, entries: OfficeEntry[]): OfficeEntry => ({
  kind: 'submenu',
  id,
  label,
  entries,
});

const SEPARATOR: OfficeEntry = { kind: 'separator' };

const menu = (id: string, label: string, entries: OfficeEntry[]): OfficeMenu => ({
  id,
  label,
  entries,
});

const BUILT = { status: 'built' } as const;

// Insert > Image, in Google's order, and the toolbar's Insert image list (objects.md "Inserting"); Drive and Photos are
// Google's own.
export const IMAGE_ENTRIES: readonly OfficeEntry[] = [
  item('image-upload', 'Upload from computer', 'edit', BUILT),
  item('image-search', 'Search the web', 'edit', { keywords: ['openverse', 'picture'], ...BUILT }),
  item('image-gallery', 'LiveDoc gallery', 'edit', BUILT),
  item('image-by-url', 'By URL', 'edit'),
];

// A text document downloads in its own format; the other format's file is a converted copy, built with conversion.
function downloads(format: TextDocumentFormat): OfficeEntry[] {
  const odf = format === 'odf' ? BUILT : {};
  return [
    item('download-docx', 'Microsoft Word (.docx)', 'view', format === 'ooxml' ? BUILT : {}),
    item('download-odt', 'OpenDocument format (.odt)', 'view', odf),
    item('download-fodt', 'OpenDocument flat file (.fodt)', 'view', odf),
    item('download-rtf', 'Rich Text Format (.rtf)', 'view'),
    item('download-pdf', 'PDF document (.pdf)', 'view'),
    item('download-txt', 'Plain Text (.txt)', 'view'),
    item('download-html', 'Web Page (.html, zipped)', 'view'),
    item('download-epub', 'EPUB Publication (.epub)', 'view'),
    item('download-md', 'Markdown (.md)', 'view'),
  ];
}

export function textDocumentMenus(format: TextDocumentFormat): OfficeCatalogue {
  return [
    menu('file', 'File', [
      submenu('new', 'New', [
        item('new-document', 'Document', 'view'),
        item('new-from-template', 'From template gallery', 'view'),
      ]),
      item('open', 'Open', 'view', { shortcut: 'open', status: 'built' }),
      item('make-a-copy', 'Make a copy', 'view'),
      SEPARATOR,
      submenu('share', 'Share', [item('share-with-others', 'Share with others', 'edit', BUILT)]),
      submenu('download', 'Download', downloads(format)),
      format === 'odf'
        ? item('convert-to-word', 'Convert to Word format', 'edit', { keywords: ['docx', 'ooxml'] })
        : item('convert-to-opendocument', 'Convert to OpenDocument', 'edit', {
            keywords: ['odt', 'odf'],
          }),
      SEPARATOR,
      item('rename', 'Rename', 'edit', BUILT),
      item('move', 'Move', 'edit', { keywords: ['folder'], status: 'built' }),
      item('move-to-trash', 'Move to trash', 'edit', { keywords: ['delete'] }),
      SEPARATOR,
      submenu('version-history', 'Version history', [
        item('name-current-version', 'Name current version', 'edit'),
        item('see-version-history', 'See version history', 'edit', {
          shortcut: 'open-revision-history',
        }),
      ]),
      item('make-available-offline', 'Make available offline', 'edit', {
        keywords: ['this browser'],
      }),
      SEPARATOR,
      item('details', 'Details', 'view'),
      item('security-limitations', 'Security limitations', 'view'),
      item('language', 'Language', 'edit'),
      SEPARATOR,
      item('page-setup', 'Page setup', 'edit', BUILT),
      item('print-preview', 'Print preview', 'view'),
      item('print', 'Print', 'view', { shortcut: 'print' }),
    ]),
    menu('edit', 'Edit', [
      item('undo', 'Undo', 'edit', { shortcut: 'undo', status: 'built' }),
      item('redo', 'Redo', 'edit', { shortcut: 'redo', status: 'built' }),
      SEPARATOR,
      item('cut', 'Cut', 'edit', { shortcut: 'cut', status: 'built' }),
      item('copy', 'Copy', 'view', { shortcut: 'copy', status: 'built' }),
      item('paste', 'Paste', 'edit', { shortcut: 'paste', status: 'built' }),
      item('paste-without-formatting', 'Paste without formatting', 'edit', {
        shortcut: 'paste-without-formatting',
        status: 'built',
      }),
      SEPARATOR,
      item('select-all', 'Select all', 'view', { shortcut: 'select-all', status: 'built' }),
      item('delete', 'Delete', 'edit', BUILT),
      SEPARATOR,
      item('find-and-replace', 'Find and replace', 'view', {
        shortcut: 'find-and-replace',
        keywords: ['search'],
      }),
    ]),
    menu('view', 'View', [
      submenu('mode', 'Mode', [
        item('mode-editing', 'Editing', 'view', {
          shortcut: 'switch-to-editing',
          checkable: 'radio',
          status: 'built',
        }),
        item('mode-suggesting', 'Suggesting', 'view', {
          shortcut: 'switch-to-suggesting',
          checkable: 'radio',
        }),
        item('mode-viewing', 'Viewing', 'view', {
          shortcut: 'switch-to-viewing',
          checkable: 'radio',
          status: 'built',
        }),
      ]),
      SEPARATOR,
      item('show-print-layout', 'Show print layout', 'view', {
        checkable: 'checkbox',
        status: 'built',
      }),
      item('show-ruler', 'Show ruler', 'view', { checkable: 'checkbox', status: 'built' }),
      item('show-outline', 'Show outline', 'view', {
        checkable: 'checkbox',
        shortcut: 'show-outline',
        status: 'built',
      }),
      item('show-tabs-and-outlines', 'Show tabs & outlines', 'view', { checkable: 'checkbox' }),
      item('show-equation-toolbar', 'Show equation toolbar', 'edit', { checkable: 'checkbox' }),
      item('show-non-printing-characters', 'Show non-printing characters', 'view', {
        checkable: 'checkbox',
        shortcut: 'show-non-printing-characters',
        status: 'built',
      }),
      SEPARATOR,
      submenu('text-width', 'Text width', [
        item('text-width-narrow', 'Narrow', 'view', { checkable: 'radio', status: 'built' }),
        item('text-width-medium', 'Medium', 'view', { checkable: 'radio', status: 'built' }),
        item('text-width-wide', 'Wide', 'view', { checkable: 'radio', status: 'built' }),
        item('text-width-full', 'Full', 'view', { checkable: 'radio', status: 'built' }),
      ]),
      item('full-screen', 'Full screen', 'view'),
    ]),
    menu('insert', 'Insert', [
      submenu('image', 'Image', [...IMAGE_ENTRIES]),
      submenu('table', 'Table', [
        item('table-grid', 'Table', 'edit', { sizeGrid: { columns: 20, rows: 20 }, ...BUILT }),
        item('table-templates', 'Table templates', 'edit'),
      ]),
      SEPARATOR,
      item('link', 'Link', 'edit', { shortcut: 'insert-or-edit-link' }),
      submenu('drawing', 'Drawing', [
        item('drawing-new', 'New', 'edit'),
        item('drawing-from-document', 'From a LiveDoc document', 'edit'),
      ]),
      submenu('chart', 'Chart', [
        item('chart-bar', 'Bar', 'edit'),
        item('chart-column', 'Column', 'edit'),
        item('chart-line', 'Line', 'edit'),
        item('chart-pie', 'Pie', 'edit'),
        item('chart-from-spreadsheet', 'From a spreadsheet', 'edit'),
      ]),
      submenu('symbols', 'Symbols', [
        item('special-characters', 'Special characters', 'edit', BUILT),
        item('equation', 'Equation', 'edit'),
      ]),
      SEPARATOR,
      item('tab', 'Tab', 'edit'),
      item('horizontal-line', 'Horizontal line', 'edit', BUILT),
      item('emoji', 'Emoji', 'edit', BUILT),
      item('footnote', 'Footnote', 'edit', { shortcut: 'insert-footnote', ...BUILT }),
      submenu('headers-and-footers', 'Headers & footers', [
        item('header', 'Header', 'edit', { shortcut: 'insert-or-move-to-header', ...BUILT }),
        item('footer', 'Footer', 'edit', { shortcut: 'insert-or-move-to-footer', ...BUILT }),
      ]),
      submenu('page-numbers', 'Page numbers', [
        ...PAGE_NUMBER_PRESETS.map((preset) => item(preset.item, preset.label, 'edit', BUILT)),
        SEPARATOR,
        item('page-count', 'Page count', 'edit', BUILT),
        item('page-numbers-more', 'More options', 'edit', BUILT),
      ]),
      item('watermark', 'Watermark', 'edit', { checkable: 'checkbox', status: 'built' }),
      submenu('break', 'Break', [
        item('page-break', 'Page break', 'edit', { shortcut: 'insert-page-break', ...BUILT }),
        item('section-break-next-page', 'Section break (next page)', 'edit', BUILT),
        item('section-break-continuous', 'Section break (continuous)', 'edit', BUILT),
        item('column-break', 'Column break', 'edit', BUILT),
      ]),
      item('bookmark', 'Bookmark', 'edit'),
      submenu('table-of-contents', 'Table of contents', [
        item('toc-plain', 'Plain text', 'edit'),
        item('toc-dotted', 'Dotted', 'edit'),
        item('toc-links', 'With blue links', 'edit'),
      ]),
      SEPARATOR,
      item('comment', 'Comment', 'participate', { shortcut: 'insert-comment' }),
    ]),
    menu('format', 'Format', [
      submenu('text', 'Text', [
        item('bold', 'Bold', 'edit', { shortcut: 'bold', ...BUILT }),
        item('italic', 'Italic', 'edit', { shortcut: 'italicize', ...BUILT }),
        item('underline', 'Underline', 'edit', { shortcut: 'underline', ...BUILT }),
        item('strikethrough', 'Strikethrough', 'edit', { shortcut: 'strikethrough', ...BUILT }),
        item('superscript', 'Superscript', 'edit', { shortcut: 'superscript', ...BUILT }),
        item('subscript', 'Subscript', 'edit', { shortcut: 'subscript', ...BUILT }),
        item('small-caps', 'Small caps', 'edit', { shortcut: 'small-caps', ...BUILT }),
        SEPARATOR,
        item('size-increase', 'Increase font size', 'edit', {
          shortcut: 'increase-font-size',
          ...BUILT,
        }),
        item('size-decrease', 'Decrease font size', 'edit', {
          shortcut: 'decrease-font-size',
          ...BUILT,
        }),
        SEPARATOR,
        submenu('capitalisation', 'Capitalisation', [
          item('lowercase', 'lowercase', 'edit', BUILT),
          item('uppercase', 'UPPERCASE', 'edit', BUILT),
          item('title-case', 'Title Case', 'edit', BUILT),
        ]),
      ]),
      // Each style a submenu holding Apply and Update to match, as Google's (text-and-paragraphs.md).
      submenu('paragraph-styles', 'Paragraph styles', [
        item(BORDERS_ITEM, 'Borders and shading', 'edit', { keywords: ['background'], ...BUILT }),
        SEPARATOR,
        ...PARAGRAPH_STYLE_ITEMS.map((style) =>
          submenu(`${style.item}-menu`, style.label, paragraphStyleEntries(style)),
        ),
        SEPARATOR,
        STYLE_OPTIONS,
      ]),
      submenu('align-and-indent', 'Align & indent', [
        item('align-left', 'Left', 'edit', {
          shortcut: 'left-align',
          checkable: 'radio',
          ...BUILT,
        }),
        item('align-centre', 'Centre', 'edit', {
          shortcut: 'center-align',
          keywords: ['center'],
          checkable: 'radio',
          ...BUILT,
        }),
        item('align-right', 'Right', 'edit', {
          shortcut: 'right-align',
          checkable: 'radio',
          ...BUILT,
        }),
        item('align-justified', 'Justified', 'edit', {
          shortcut: 'justify',
          checkable: 'radio',
          ...BUILT,
        }),
        SEPARATOR,
        item('indent-increase', 'Increase indent', 'edit', {
          shortcut: 'increase-paragraph-indentation',
          ...BUILT,
        }),
        item('indent-decrease', 'Decrease indent', 'edit', {
          shortcut: 'decrease-paragraph-indentation',
          ...BUILT,
        }),
        item('indentation-options', 'Indentation options', 'edit', BUILT),
      ]),
      submenu('line-spacing', 'Line & paragraph spacing', [...LINE_SPACING_ENTRIES]),
      submenu('columns', 'Columns', [
        item('columns-one', 'One column', 'edit', { checkable: 'radio', ...BUILT }),
        item('columns-two', 'Two columns', 'edit', { checkable: 'radio', ...BUILT }),
        item('columns-three', 'Three columns', 'edit', { checkable: 'radio', ...BUILT }),
        item('columns-more', 'More options', 'edit', BUILT),
      ]),
      submenu('bullets-and-numbering', 'Bullets & numbering', [
        item('numbered-list', 'Numbered list', 'edit', { shortcut: 'numbered-list', ...BUILT }),
        item('bulleted-list', 'Bulleted list', 'edit', { shortcut: 'bulleted-list', ...BUILT }),
        item('checklist', 'Checklist', 'edit', { shortcut: 'checklist', ...BUILT }),
        submenu('list-options', 'List options', [
          item('restart-numbering', 'Restart numbering', 'edit', BUILT),
          item('continue-numbering', 'Continue previous numbering', 'edit', BUILT),
          item('more-bullets', 'More bullets', 'edit', BUILT),
        ]),
      ]),
      SEPARATOR,
      item('headers-and-footers-options', 'Headers & footers', 'edit', BUILT),
      item('page-numbers-options', 'Page numbers', 'edit', BUILT),
      item('page-orientation', 'Page orientation', 'edit', BUILT),
      item('switch-to-pageless', 'Switch to Pageless format', 'edit', BUILT),
      SEPARATOR,
      // tables.md "Format > Table": the order is (default) until Webber's capture.
      submenu('format-table', 'Table', [
        item('table-properties', 'Table properties', 'edit', BUILT),
        SEPARATOR,
        item('table-insert-row-above', 'Insert row above', 'edit', BUILT),
        item('table-insert-row-below', 'Insert row below', 'edit', BUILT),
        item('table-insert-column-left', 'Insert column left', 'edit', BUILT),
        item('table-insert-column-right', 'Insert column right', 'edit', BUILT),
        SEPARATOR,
        item('table-delete-row', 'Delete row', 'edit', BUILT),
        item('table-delete-column', 'Delete column', 'edit', BUILT),
        item('table-delete', 'Delete table', 'edit', BUILT),
        SEPARATOR,
        item('table-move-row-up', 'Move row up', 'edit', BUILT),
        item('table-move-row-down', 'Move row down', 'edit', BUILT),
        item('table-move-column-left', 'Move column left', 'edit', BUILT),
        item('table-move-column-right', 'Move column right', 'edit', BUILT),
        SEPARATOR,
        item('table-distribute-rows', 'Distribute rows', 'edit', BUILT),
        item('table-distribute-columns', 'Distribute columns', 'edit', BUILT),
        SEPARATOR,
        item('table-merge-cells', 'Merge cells', 'edit', BUILT),
        item('table-unmerge-cells', 'Unmerge cells', 'edit', BUILT),
        SEPARATOR,
        submenu('table-sort', 'Sort table', [
          item('table-sort-ascending', 'Sort ascending', 'edit', BUILT),
          item('table-sort-descending', 'Sort descending', 'edit', BUILT),
        ]),
        submenu('table-pin-header-rows', 'Pin header rows', [
          item('table-pin-none', "Don't pin", 'edit', BUILT),
          item('table-pin-current', 'Pin up to current row', 'edit', BUILT),
        ]),
      ]),
      submenu('format-image', 'Image', [
        item('image-crop', 'Crop image', 'edit', BUILT),
        item('image-options', 'Image options', 'edit', BUILT),
        item('image-alt-text', 'Alt text', 'edit', { shortcut: 'alt-text', ...BUILT }),
        submenu('image-replace', 'Replace image', [
          item('image-replace-upload', 'Upload from computer', 'edit', BUILT),
          item('image-replace-search', 'Search the web', 'edit', BUILT),
          item('image-replace-gallery', 'LiveDoc gallery', 'edit', BUILT),
        ]),
        item('image-reset', 'Reset image', 'edit', BUILT),
      ]),
      item('borders-and-lines', 'Borders & lines', 'edit', { keywords: ['shading'] }),
      SEPARATOR,
      item('clear-formatting', 'Clear formatting', 'edit', {
        shortcut: 'clear-text-formatting',
        ...BUILT,
      }),
    ]),
    menu('tools', 'Tools', [
      item('spelling-and-grammar', 'Spelling and grammar', 'edit', {
        shortcut: 'open-spelling-and-grammar',
      }),
      item('word-count', 'Word count', 'view', { shortcut: 'word-count' }),
      item('review-suggested-edits', 'Review suggested edits', 'edit', {
        shortcut: 'review-suggested-edits',
      }),
      item('compare-documents', 'Compare documents', 'edit'),
      item('line-numbers', 'Line numbers', 'edit', { checkable: 'checkbox', status: 'built' }),
      SEPARATOR,
      item('notification-settings', 'Notification settings', 'participate'),
      item('preferences', 'Preferences', 'edit', {
        keywords: ['autocorrect', 'substitutions'],
        status: 'built',
      }),
      item('accessibility', 'Accessibility', 'view', { keywords: ['screen reader', 'braille'] }),
    ]),
    menu('extensions', 'Extensions', [
      item('agents', 'Agents', 'view', { keywords: ['mcp', 'cli'] }),
    ]),
    menu('help', 'Help', [
      item('search-the-menus', 'Search the menus', 'view', {
        shortcut: 'tool-finder',
        keywords: ['tool finder'],
        status: 'built',
      }),
      SEPARATOR,
      item('help', 'Help', 'view'),
      item('training', 'Training', 'view'),
      item('updates', 'Updates', 'view'),
      item('help-improve', 'Help improve LiveDoc', 'view', { keywords: ['report a bug'] }),
      SEPARATOR,
      item('privacy-policy', 'Privacy policy', 'view'),
      item('terms-of-service', 'Terms of service', 'view'),
      SEPARATOR,
      item('keyboard-shortcuts', 'Keyboard shortcuts', 'view', {
        shortcut: 'show-common-keyboard-shortcuts',
        status: 'built',
      }),
    ]),
  ];
}

// The context menu on text (editing-surface.md "Context menus"), in Google's order: the menus' items, by id, and the two
// it alone offers. Suggest edits is for whoever may suggest, never a Viewer.
export function textDocumentTextContextMenu(catalogue: OfficeCatalogue): OfficeEntry[] {
  return contextEntries(catalogue, [
    'cut',
    'copy',
    'paste',
    'paste-without-formatting',
    'delete',
    SEPARATOR,
    'comment',
    { id: 'mode-suggesting', label: 'Suggest edits', level: 'participate' },
    SEPARATOR,
    { id: 'link', label: 'Insert link' },
    SEPARATOR,
    item('format-options', 'Format options', 'edit'),
    'clear-formatting',
    { id: 'restart-numbering', contextual: true },
    { id: 'continue-numbering', contextual: true },
    SEPARATOR,
    item('select-all-matching-text', 'Select all matching text', 'view', BUILT),
    // On a selected picture (objects.md "Working with a picture"); the order is (default) until a capture.
    SEPARATOR,
    { id: 'image-crop', contextual: true },
    { id: 'image-replace-gallery', label: 'Replace image', contextual: true },
    { id: 'image-options', contextual: true },
    { id: 'image-alt-text', contextual: true },
    // On a cell (tables.md "Context menu"): only in a table; the order is (default) until Webber's capture.
    SEPARATOR,
    ...[
      'table-insert-row-above',
      'table-insert-row-below',
      'table-insert-column-left',
      'table-insert-column-right',
      'table-delete-row',
      'table-delete-column',
      'table-delete',
      'table-distribute-rows',
      'table-distribute-columns',
      'table-merge-cells',
      'table-unmerge-cells',
    ].map((id) => ({ id, contextual: true as const })),
    { id: 'table-sort-ascending', label: 'Sort table ascending', contextual: true },
    { id: 'table-sort-descending', label: 'Sort table descending', contextual: true },
    { id: 'table-properties', contextual: true },
  ]);
}
