// A PDF document's menus (docs/specs/035-pdf-documents/reading-surface.md "Menus"), as the office shell's catalogue
// (office-shell.md "Menus as data"). The spec's tables are this catalogue's source: every item they name is here, in
// their order, at their level, and pdf-menus-spec.test.ts holds the two together. An item whose phase has not landed
// is `comingSoon`, drawn dimmed; where the separators fall is this file's.
import type { AccessLevel } from '@livedoc/api-schema';
import type {
  OfficeCatalogue,
  OfficeEntry,
  OfficeItem,
  OfficeMenu,
} from '@/lib/office/office-catalogue';

type ItemOptions = Partial<Pick<OfficeItem, 'shortcut' | 'keywords' | 'checkable' | 'status'>>;

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

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A submenu of names alone: each item's id is the submenu's and its name's (`opacity-75`). */
const choices = (
  id: string,
  label: string,
  level: AccessLevel,
  names: readonly string[],
  options: ItemOptions = {},
): OfficeEntry =>
  submenu(
    id,
    label,
    names.map((name) => item(`${id}-${slug(name)}`, name, level, options)),
  );

const SEPARATOR: OfficeEntry = { kind: 'separator' };

const menu = (id: string, label: string, entries: OfficeEntry[]): OfficeMenu => ({
  id,
  label,
  entries,
});

const BUILT = { status: 'built' } as const;
const CHECK = { checkable: 'checkbox' } as const;
const ONE_OF = { checkable: 'radio' } as const;

/** File > Download > PDF: the bake, every live change in the file (files-print-and-sync.md "Downloading"). */
export const DOWNLOAD_PDF = 'download-pdf';
export const UNDO = 'undo';
export const REDO = 'redo';
export const PRINT = 'print';
/** Edit > Copy and Select all: the text selected on the pages (reading-surface.md "The pages"). */
export const COPY = 'copy';
export const SELECT_ALL = 'select-all';
export const FIND = 'find';
export const TOOL_SELECT = 'tool-select';
export const TOOL_HAND = 'tool-hand';
export const TOOL_HIGHLIGHT = 'tool-highlight';
export const TOOL_TEXT = 'tool-text';
export const TOOL_DRAWING = 'tool-drawing';
export const TOOL_TICK = 'tool-tick';
export const INSERT_COMMENT = 'insert-comment';
export const INSERT_TEXT_BOX = 'insert-text-box';
export const INSERT_PICTURE = 'insert-picture';
export const INSERT_LINK = 'insert-link';
export const EDIT_TEXT = 'edit-text';
export const EDIT_OBJECTS = 'edit-objects';
export const ORGANISE_PAGES = 'organise-pages';
export const ROTATE_VIEW_CLOCKWISE = 'rotate-view-clockwise';
export const ROTATE_VIEW_COUNTERCLOCKWISE = 'rotate-view-counterclockwise';
export const DARK_PAGES = 'dark-pages';
/** View > Page display, Zoom and Go to: one person's view (reading-surface.md "The pages", "The page bar"). */
export const PAGE_DISPLAY_SINGLE = 'page-display-single-page';
export const PAGE_DISPLAY_CONTINUOUS = 'page-display-continuous';
export const PAGE_DISPLAY_TWO = 'page-display-two-pages';
export const PAGE_DISPLAY_TWO_CONTINUOUS = 'page-display-two-pages-continuous';
export const PAGE_DISPLAY_COVER = 'page-display-show-cover-page';
export const ZOOM_IN = 'zoom-in';
export const ZOOM_OUT = 'zoom-out';
export const ZOOM_FIT_WIDTH = 'zoom-fit-width';
export const ZOOM_FIT_PAGE = 'zoom-fit-page';
export const ZOOM_ACTUAL_SIZE = 'zoom-actual-size';
/** View > Zoom's item for a percentage. */
export const zoomPercentId = (percent: number): string => `zoom-${percent}`;
export const GO_TO_FIRST_PAGE = 'go-to-first-page';
export const GO_TO_LAST_PAGE = 'go-to-last-page';
export const GO_TO_PREVIOUS_PAGE = 'go-to-previous-page';
export const GO_TO_NEXT_PAGE = 'go-to-next-page';
export const GO_TO_PAGE = 'go-to-page';
export const GO_TO_PREVIOUS_VIEW = 'go-to-previous-view';
export const GO_TO_NEXT_VIEW = 'go-to-next-view';
/** View > Thumbnails: the left panel's (reading-surface.md "The left panel"). */
export const PANEL_THUMBNAILS = 'panel-thumbnails';
/** View > Outline: the file's bookmarks (reading-surface.md "Outline"). */
export const PANEL_OUTLINE = 'panel-outline';
/** View > Embedded files: the files the PDF carries (reading-surface.md "Embedded files"). */
export const PANEL_EMBEDDED_FILES = 'panel-embedded-files';
/** View > Layers: the file's PDF layers, shown or hidden for one person (reading-surface.md "Layers"). */
export const PANEL_LAYERS = 'panel-layers';

/** View > Zoom's percentages: Acrobat's own levels from 50% ("View"). */
export const PDF_ZOOM_MENU_PERCENTS: readonly number[] = [
  50, 75, 100, 125, 150, 200, 400, 800, 1600, 2400, 3200, 6400,
];

/** View > Page display, also the Viewing toolbar's Page display list ("The toolbar"). */
export const PAGE_DISPLAY_MENU = submenu('page-display', 'Page display', [
  item(PAGE_DISPLAY_SINGLE, 'Single page', 'view', { ...BUILT, ...ONE_OF }),
  item(PAGE_DISPLAY_CONTINUOUS, 'Continuous', 'view', { ...BUILT, ...ONE_OF }),
  item(PAGE_DISPLAY_TWO, 'Two pages', 'view', { ...BUILT, ...ONE_OF }),
  item(PAGE_DISPLAY_TWO_CONTINUOUS, 'Two pages, continuous', 'view', { ...BUILT, ...ONE_OF }),
  SEPARATOR,
  item(PAGE_DISPLAY_COVER, 'Show cover page', 'view', { ...BUILT, ...CHECK }),
]);

export const PDF_MENUS: OfficeCatalogue = [
  menu('file', 'File', [
    item('open', 'Open', 'view'),
    item('make-a-copy', 'Make a copy', 'view'),
    SEPARATOR,
    submenu('share', 'Share', [
      item('share-with-others', 'Share with others', 'edit', BUILT),
      item('copy-link', 'Copy link', 'edit'),
    ]),
    submenu('email', 'Email', [item('email-this-file', 'Email this file', 'view')]),
    submenu('download', 'Download', [
      item(DOWNLOAD_PDF, 'PDF', 'view', { status: 'built', keywords: ['save', 'export'] }),
      item('download-pdf-flattened', 'PDF, flattened', 'view'),
      item('download-pdf-without-comments', 'PDF without comments', 'view'),
      item('download-pictures', 'Pages as pictures', 'view', { keywords: ['png', 'jpeg'] }),
      item('download-text', 'Text', 'view'),
      item('download-field-data', 'Field data', 'view', { keywords: ['fdf', 'form'] }),
    ]),
    item('replace-file', 'Replace file', 'edit'),
    item('open-as-text-document', 'Open as a text document', 'view', { keywords: ['convert'] }),
    SEPARATOR,
    item('rename', 'Rename', 'edit', BUILT),
    item('move', 'Move', 'edit', { keywords: ['folder'], status: 'built' }),
    item('move-to-trash', 'Move to trash', 'edit', { keywords: ['delete'] }),
    SEPARATOR,
    choices('version-history', 'Version history', 'participate', [
      'Name current version',
      'See version history',
      'Previous versions',
    ]),
    item('make-available-offline', 'Make available offline', 'view', {
      keywords: ['this browser'],
    }),
    SEPARATOR,
    item('properties', 'Properties', 'view', { keywords: ['fonts', 'security', 'size'] }),
    item(PRINT, 'Print', 'view'),
  ]),
  menu('edit', 'Edit', [
    item(UNDO, 'Undo', 'participate', { shortcut: 'undo', status: 'built' }),
    item(REDO, 'Redo', 'participate', { shortcut: 'redo', status: 'built' }),
    SEPARATOR,
    item('cut', 'Cut', 'participate'),
    item(COPY, 'Copy', 'view', { shortcut: COPY, status: 'built' }),
    item('paste', 'Paste', 'participate'),
    item('delete', 'Delete', 'participate'),
    SEPARATOR,
    item(SELECT_ALL, 'Select all', 'view', { shortcut: SELECT_ALL, status: 'built' }),
    SEPARATOR,
    item(FIND, 'Find', 'view', { keywords: ['search'], shortcut: FIND, status: 'built' }),
    item('find-and-replace', 'Find and replace', 'edit', { keywords: ['search'] }),
    SEPARATOR,
    item(EDIT_TEXT, 'Edit text', 'edit'),
    item(EDIT_OBJECTS, 'Edit objects', 'edit', { keywords: ['object tool'] }),
    SEPARATOR,
    item('take-a-snapshot', 'Take a snapshot', 'view', { keywords: ['screenshot', 'picture'] }),
  ]),
  menu('view', 'View', [
    submenu('mode', 'Mode', [
      item('mode-reviewing', 'Reviewing', 'view', {
        shortcut: 'switch-to-reviewing',
        checkable: 'radio',
        status: 'built',
      }),
      item('mode-editing', 'Editing', 'view', {
        shortcut: 'switch-to-editing',
        checkable: 'radio',
      }),
      item('mode-viewing', 'Viewing', 'view', {
        shortcut: 'switch-to-viewing',
        checkable: 'radio',
        status: 'built',
      }),
    ]),
    SEPARATOR,
    PAGE_DISPLAY_MENU,
    submenu('zoom', 'Zoom', [
      item(ZOOM_IN, 'Zoom in', 'view', { ...BUILT, shortcut: ZOOM_IN }),
      item(ZOOM_OUT, 'Zoom out', 'view', { ...BUILT, shortcut: ZOOM_OUT }),
      SEPARATOR,
      item(ZOOM_FIT_WIDTH, 'Fit width', 'view', { ...BUILT, ...ONE_OF, shortcut: ZOOM_FIT_WIDTH }),
      item(ZOOM_FIT_PAGE, 'Fit page', 'view', { ...BUILT, ...ONE_OF, shortcut: ZOOM_FIT_PAGE }),
      item(ZOOM_ACTUAL_SIZE, 'Actual size', 'view', {
        ...BUILT,
        ...ONE_OF,
        shortcut: ZOOM_ACTUAL_SIZE,
      }),
      SEPARATOR,
      ...PDF_ZOOM_MENU_PERCENTS.map((percent) =>
        item(zoomPercentId(percent), `${percent}%`, 'view', { ...BUILT, ...ONE_OF }),
      ),
      SEPARATOR,
      item('zoom-to-selection', 'Zoom to selection', 'view'),
    ]),
    submenu('rotate-view', 'Rotate view', [
      item(ROTATE_VIEW_CLOCKWISE, 'Clockwise', 'view', {
        ...BUILT,
        shortcut: ROTATE_VIEW_CLOCKWISE,
      }),
      item(ROTATE_VIEW_COUNTERCLOCKWISE, 'Counterclockwise', 'view', {
        ...BUILT,
        shortcut: ROTATE_VIEW_COUNTERCLOCKWISE,
      }),
    ]),
    SEPARATOR,
    item(PANEL_THUMBNAILS, 'Thumbnails', 'view', { ...BUILT, ...CHECK, keywords: ['pages'] }),
    item(PANEL_OUTLINE, 'Outline', 'view', { ...BUILT, ...CHECK, keywords: ['bookmarks'] }),
    item(PANEL_EMBEDDED_FILES, 'Embedded files', 'view', {
      ...BUILT,
      ...CHECK,
      keywords: ['attachments'],
    }),
    item(PANEL_LAYERS, 'Layers', 'view', { ...BUILT, ...CHECK }),
    item('panel-signatures', 'Signatures', 'view', CHECK),
    item('panel-fields', 'Fields', 'view', { ...CHECK, keywords: ['form'] }),
    SEPARATOR,
    item('panel-comments', 'Comments', 'view', CHECK),
    item('show-marks', 'Marks', 'view', { ...CHECK, keywords: ['annotations', 'hide'] }),
    item(DARK_PAGES, 'Dark pages', 'view', { ...CHECK, keywords: ['night', 'invert'] }),
    SEPARATOR,
    item('read-mode', 'Read mode', 'view', CHECK),
    item('full-screen', 'Full screen', 'view', { ...CHECK, keywords: ['present'] }),
    SEPARATOR,
    submenu('go-to', 'Go to', [
      item(GO_TO_FIRST_PAGE, 'First page', 'view', BUILT),
      item(GO_TO_LAST_PAGE, 'Last page', 'view', BUILT),
      item(GO_TO_PREVIOUS_PAGE, 'Previous page', 'view', BUILT),
      item(GO_TO_NEXT_PAGE, 'Next page', 'view', BUILT),
      item(GO_TO_PAGE, 'Page…', 'view', { ...BUILT, shortcut: GO_TO_PAGE }),
      item(GO_TO_PREVIOUS_VIEW, 'Previous view', 'view', {
        ...BUILT,
        shortcut: GO_TO_PREVIOUS_VIEW,
      }),
      item(GO_TO_NEXT_VIEW, 'Next view', 'view', { ...BUILT, shortcut: GO_TO_NEXT_VIEW }),
    ]),
  ]),
  // A mark's tool is taken in hand by its item and stays there: one of a set with Select and Hand ("The toolbar").
  menu('insert', 'Insert', [
    item(INSERT_COMMENT, 'Comment', 'participate', { keywords: ['note'] }),
    SEPARATOR,
    item(TOOL_HIGHLIGHT, 'Highlight', 'participate', {
      checkable: 'radio',
      status: 'built',
      keywords: ['mark', 'marker'],
    }),
    item('tool-underline', 'Underline', 'participate', ONE_OF),
    item('tool-strikethrough', 'Strikethrough', 'participate', ONE_OF),
    item('tool-squiggly-underline', 'Squiggly underline', 'participate', ONE_OF),
    SEPARATOR,
    item(TOOL_TEXT, 'Text', 'participate', { ...ONE_OF, keywords: ['typewriter'] }),
    item('tool-callout', 'Callout', 'participate', ONE_OF),
    item(TOOL_DRAWING, 'Drawing', 'participate', { ...ONE_OF, keywords: ['freehand', 'pen'] }),
    choices('shape', 'Shape', 'participate', [
      'Line',
      'Arrow',
      'Rectangle',
      'Ellipse',
      'Polygon',
      'Cloud',
      'Connected lines',
    ]),
    choices('stamp', 'Stamp', 'participate', [
      'Standard stamps',
      'Dynamic stamps',
      'Custom stamps',
      'Manage stamps',
    ]),
    SEPARATOR,
    item(TOOL_TICK, 'Tick', 'participate', ONE_OF),
    item('tool-cross', 'Cross', 'participate', ONE_OF),
    item('tool-dot', 'Dot', 'participate', ONE_OF),
    choices('signature', 'Signature', 'participate', [
      'Drawn signature',
      'Initials',
      'Certificate signature',
      'Time stamp',
    ]),
    SEPARATOR,
    item(INSERT_TEXT_BOX, 'Text box', 'edit'),
    item(INSERT_PICTURE, 'Picture', 'edit', { keywords: ['image'] }),
    item(INSERT_LINK, 'Link', 'edit'),
    choices('field', 'Field', 'edit', [
      'Text field',
      'Date field',
      'Tick box',
      'Radio button',
      'Dropdown',
      'List',
      'Picture field',
      'Button',
      'Signature field',
    ]),
    SEPARATOR,
    item('insert-header-and-footer', 'Header and footer', 'edit'),
    item('insert-page-numbers', 'Page numbers', 'edit'),
    item('insert-watermark', 'Watermark', 'edit'),
    item('insert-background', 'Background', 'edit'),
    SEPARATOR,
    item('insert-bookmark', 'Bookmark', 'edit'),
    item('insert-embedded-file', 'Embedded file', 'edit', { keywords: ['attachment'] }),
  ]),
  menu('format', 'Format', [
    item('format-colour', 'Colour', 'participate'),
    item('format-fill-colour', 'Fill colour', 'participate'),
    choices('opacity', 'Opacity', 'participate', ['100%', '75%', '50%', '25%', '10%'], ONE_OF),
    SEPARATOR,
    choices(
      'line-width',
      'Line width',
      'participate',
      ['0.5 pt', '1 pt', '2 pt', '4 pt', '8 pt', '12 pt'],
      ONE_OF,
    ),
    choices(
      'line-style',
      'Line style',
      'participate',
      ['Solid', 'Dashed', 'Dotted', 'Dash dot', 'Long dashes'],
      ONE_OF,
    ),
    choices(
      'line-ends',
      'Line ends',
      'participate',
      ['None', 'Arrow', 'Open arrow', 'Circle', 'Square', 'Diamond', 'Bar'],
      ONE_OF,
    ),
    SEPARATOR,
    choices('align-text', 'Align text', 'participate', ['Left', 'Centre', 'Right', 'Justified'], {
      ...ONE_OF,
      keywords: ['center'],
    }),
    choices('arrange', 'Arrange', 'participate', [
      'Bring to front',
      'Bring forward',
      'Send backward',
      'Send to back',
    ]),
    item('group', 'Group', 'participate'),
    item('ungroup', 'Ungroup', 'participate'),
    item('lock', 'Lock', 'participate', CHECK),
    SEPARATOR,
    choices(
      'text',
      'Text',
      'edit',
      ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Superscript', 'Subscript'],
      CHECK,
    ),
    item('spacing', 'Spacing', 'edit', { keywords: ['line', 'paragraph', 'character'] }),
    choices('list', 'List', 'edit', ['Bulleted', 'Numbered', 'None'], ONE_OF),
    SEPARATOR,
    choices('align-objects', 'Align objects', 'edit', [
      'Left',
      'Centre',
      'Right',
      'Top',
      'Middle',
      'Bottom',
    ]),
    choices('distribute', 'Distribute', 'edit', ['Horizontally', 'Vertically']),
    choices('match-size', 'Match size', 'edit', ['Width', 'Height', 'Both']),
    choices('flip', 'Flip', 'edit', ['Horizontally', 'Vertically']),
    choices('rotate', 'Rotate', 'edit', ['Clockwise', 'Counterclockwise']),
    item('crop-picture', 'Crop', 'edit'),
  ]),
  menu('pages', 'Pages', [
    item(ORGANISE_PAGES, 'Organise pages', 'edit', { keywords: ['reorder', 'organize'] }),
    SEPARATOR,
    choices('pages-insert', 'Insert', 'edit', [
      'Blank page',
      'From a PDF',
      'From a LiveDoc document',
    ]),
    item('pages-delete', 'Delete', 'edit'),
    item('pages-extract', 'Extract', 'edit'),
    item('pages-split', 'Split', 'edit'),
    item('pages-replace', 'Replace', 'edit'),
    SEPARATOR,
    choices('pages-rotate', 'Rotate', 'edit', ['Clockwise', 'Counterclockwise', 'Half turn']),
    item('pages-crop', 'Crop', 'edit'),
    item('pages-resize', 'Resize', 'edit'),
    SEPARATOR,
    item('page-labels', 'Page labels', 'edit', { keywords: ['numbering'] }),
    item('combine-files', 'Combine files', 'edit', { keywords: ['merge'] }),
  ]),
  // The tools' keys are single letters the surface hears itself, never in a text field: they name no registry row.
  menu('tools', 'Tools', [
    item(TOOL_SELECT, 'Select', 'view', { checkable: 'radio', status: 'built' }),
    item(TOOL_HAND, 'Hand', 'view', { ...ONE_OF, keywords: ['pan', 'drag'] }),
    SEPARATOR,
    submenu('fill-in', 'Fill in', [
      item('fill-in-highlight-fields', 'Highlight fields', 'participate', CHECK),
      item('fill-in-next-field', 'Next field', 'participate'),
      item('fill-in-clear-all-fields', 'Clear all fields', 'participate'),
      SEPARATOR,
      item('fill-in-import-field-data', 'Import field data', 'participate'),
      item('fill-in-export-field-data', 'Export field data', 'participate'),
    ]),
    item('recognise-text', 'Recognise text', 'participate', { keywords: ['ocr', 'scan'] }),
    SEPARATOR,
    item('prepare-fields', 'Prepare fields', 'edit', { keywords: ['form'] }),
    choices('redact', 'Redact', 'edit', [
      'Mark for redaction',
      'Find text to redact',
      'Apply redactions',
    ]),
    choices('protect', 'Protect', 'edit', [
      'Set passwords and permissions',
      'Remove protection',
      'Remove hidden information',
    ]),
    choices('flatten', 'Flatten', 'edit', ['Marks', 'Fields', 'Both']),
    item('reduce-file-size', 'Reduce file size', 'edit', { keywords: ['compress', 'optimise'] }),
    SEPARATOR,
    item('compare', 'Compare', 'view', { keywords: ['diff', 'versions'] }),
  ]),
  menu('help', 'Help', [
    item('search-the-menus', 'Search the menus', 'view', {
      shortcut: 'tool-finder',
      keywords: ['tool finder'],
      status: 'built',
    }),
    SEPARATOR,
    item('help', 'Help', 'view'),
    item('report-a-bug', 'Report a bug', 'view'),
    SEPARATOR,
    item('keyboard-shortcuts', 'Keyboard shortcuts', 'view', {
      shortcut: 'show-common-keyboard-shortcuts',
      status: 'built',
    }),
  ]),
];
