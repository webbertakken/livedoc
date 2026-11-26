// docs/specs/035-pdf-documents/editing-modes.md "Switching", "Share roles"; reading-surface.md "Menus", "The
// toolbar"; keyboard-shortcuts.md: a PDF document's modes, menus, toolbar and shortcuts as the office shell's data.
import { describe, expect, it } from 'vitest';
import { TURN_ITEMS } from './pdf-mark-turns';
import { catalogueFaults, catalogueItems, visibleMenus } from '@/lib/office/office-catalogue';
import { levelInMode, modesFor, startingMode } from '@/lib/office/office-mode';
import { visibleToolbar } from '@/lib/office/office-toolbar';
import { SHELL_BOUND_ITEMS } from '@/lib/office/office-catalogue';
import {
  COPY,
  DARK_PAGES,
  DELETE_MARKS,
  DOWNLOAD_PDF,
  GROUP_MARKS,
  MARK_PROPERTIES,
  UNGROUP_MARKS,
  FORMAT_COLOUR,
  FORMAT_FILL_COLOUR,
  FIND,
  GO_TO_FIRST_PAGE,
  GO_TO_LAST_PAGE,
  GO_TO_NEXT_PAGE,
  GO_TO_NEXT_VIEW,
  GO_TO_PAGE,
  GO_TO_PREVIOUS_PAGE,
  GO_TO_PREVIOUS_VIEW,
  PAGE_DISPLAY_CONTINUOUS,
  PAGE_DISPLAY_COVER,
  PAGE_DISPLAY_SINGLE,
  PAGE_DISPLAY_TWO,
  PAGE_DISPLAY_TWO_CONTINUOUS,
  PANEL_EMBEDDED_FILES,
  PANEL_LAYERS,
  PANEL_OUTLINE,
  PANEL_THUMBNAILS,
  PDF_MENUS,
  PDF_ZOOM_MENU_PERCENTS,
  PRINT,
  READ_MODE,
  FULL_SCREEN,
  REDO,
  ROTATE_VIEW_CLOCKWISE,
  ROTATE_VIEW_COUNTERCLOCKWISE,
  SELECT_ALL,
  STAMP_CUSTOM,
  STAMP_DYNAMIC,
  STAMP_MANAGE,
  STAMP_STANDARD,
  TOOL_ARROW,
  TOOL_CALLOUT,
  TOOL_DRAWING,
  TOOL_ERASE,
  TOOL_ELLIPSE,
  TOOL_POLYGON,
  TOOL_CLOUD,
  TOOL_CONNECTED_LINES,
  TOOL_LINE,
  TOOL_RECTANGLE,
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  TOOL_SQUIGGLY,
  TOOL_STRIKETHROUGH,
  TOOL_TEXT,
  TOOL_UNDERLINE,
  UNDO,
  ZOOM_ACTUAL_SIZE,
  ZOOM_FIT_PAGE,
  ZOOM_FIT_WIDTH,
  ZOOM_IN,
  ZOOM_OUT,
  zoomPercentId,
} from './pdf-menus';
import { PDF_MODES, type PdfMode } from './pdf-modes';
import { PDF_SHORTCUTS, PDF_TOOL_KEYS } from './pdf-shortcuts';
import {
  ALIGN_ITEMS,
  END_ITEMS,
  OPACITY_ITEMS,
  STYLE_ITEMS,
  WIDTH_ITEMS,
} from './pdf-mark-restyle';
import {
  PAGE_DISPLAY_CONTROL,
  pdfToolbar,
  SHAPE_TOOLS,
  DRAWING_TOOLS,
  TEXT_MARK_TOOLS,
  STAMP_TOOLS,
  TYPED_TOOLS,
} from './pdf-toolbar';

// The toolbar lists the surface binds (pdf-view-actions.ts).
const CHOICES = [PAGE_DISPLAY_CONTROL];

describe("a PDF document's editing modes", () => {
  it('declares Reviewing, Editing and Viewing, in that order', () => {
    expect(PDF_MODES.map((m) => [m.label, m.description, m.level, m.drawnAt])).toEqual([
      ['Reviewing', 'Mark text, comment, fill in and sign', 'participate', 'participate'],
      ['Editing', 'Change the pages themselves', 'edit', 'edit'],
      ['Viewing', 'Read or print the PDF', 'view', 'view'],
    ]);
  });

  // "Share roles": Editor: all three; Participant: Viewing and Reviewing; Viewer: Viewing.
  it('lists the modes each level reaches', () => {
    const ids = (level: 'edit' | 'participate' | 'view') =>
      modesFor(PDF_MODES, level).map((m) => m.mode);
    expect(ids('edit')).toEqual(['reviewing', 'editing', 'viewing']);
    expect(ids('participate')).toEqual(['reviewing', 'viewing']);
    expect(ids('view')).toEqual(['viewing']);
  });

  // "A person starts in Reviewing, or in Viewing when their level allows no more"; an Editor starts in Reviewing too.
  it('starts a person in Reviewing, a Viewer in Viewing', () => {
    expect(startingMode(PDF_MODES, 'edit')).toBe('reviewing');
    expect(startingMode(PDF_MODES, 'participate')).toBe('reviewing');
    expect(startingMode(PDF_MODES, 'view')).toBe('viewing');
  });

  it('never draws the menus for more than the mode or the level', () => {
    expect(levelInMode(PDF_MODES, 'edit', 'reviewing')).toBe('participate');
    expect(levelInMode(PDF_MODES, 'edit', 'viewing')).toBe('view');
    expect(levelInMode(PDF_MODES, 'view', 'reviewing')).toBe('view');
  });
});

describe("a PDF document's menus and toolbar", () => {
  const BOUND = [
    ...SHELL_BOUND_ITEMS,
    DOWNLOAD_PDF,
    PRINT,
    UNDO,
    REDO,
    TOOL_SELECT,
    // usePdfMarkSelection.ts: Edit > Delete, Format > Group and Ungroup (marks.md "Changing a mark").
    DELETE_MARKS,
    GROUP_MARKS,
    UNGROUP_MARKS,
    // usePdfMarkProperties.ts: Format > Properties.
    MARK_PROPERTIES,
    // usePdfMarkTurns.ts: Format > Rotate, the selected marks that turn.
    ...Object.keys(TURN_ITEMS),
    // usePdfMarkRestyle.ts: Format > Opacity, Line width, Line style, Line ends and Align text, of the selected marks.
    ...Object.keys(OPACITY_ITEMS),
    ...Object.keys(ALIGN_ITEMS),
    ...Object.keys(WIDTH_ITEMS),
    ...Object.keys(STYLE_ITEMS),
    ...Object.keys(END_ITEMS),
    // pdf-look-controls.ts: Format > Colour and Fill colour open the toolbar's.
    FORMAT_COLOUR,
    FORMAT_FILL_COLOUR,
    // usePdfMarkTools.ts: the text tools (marks.md "Making a mark").
    TOOL_HIGHLIGHT,
    TOOL_UNDERLINE,
    TOOL_STRIKETHROUGH,
    TOOL_SQUIGGLY,
    TOOL_DRAWING,
    TOOL_ERASE,
    TOOL_TEXT,
    TOOL_CALLOUT,
    // usePdfToolControl.ts: the shape tools.
    TOOL_LINE,
    TOOL_ARROW,
    TOOL_RECTANGLE,
    TOOL_ELLIPSE,
    TOOL_POLYGON,
    TOOL_CLOUD,
    TOOL_CONNECTED_LINES,
    // usePdfStampTool.ts: Insert > Stamp's categories built (marks.md "Stamps").
    STAMP_STANDARD,
    STAMP_DYNAMIC,
    STAMP_CUSTOM,
    STAMP_MANAGE,
    COPY,
    SELECT_ALL,
    FIND,
    'mode-reviewing',
    'mode-viewing',
    // pdf-view-actions.ts: View > Page display, Zoom and Go to.
    PAGE_DISPLAY_SINGLE,
    PAGE_DISPLAY_CONTINUOUS,
    PAGE_DISPLAY_TWO,
    PAGE_DISPLAY_TWO_CONTINUOUS,
    PAGE_DISPLAY_COVER,
    ZOOM_IN,
    ZOOM_OUT,
    ZOOM_FIT_WIDTH,
    ZOOM_FIT_PAGE,
    ZOOM_ACTUAL_SIZE,
    ...PDF_ZOOM_MENU_PERCENTS.map(zoomPercentId),
    GO_TO_FIRST_PAGE,
    GO_TO_LAST_PAGE,
    GO_TO_PREVIOUS_PAGE,
    GO_TO_NEXT_PAGE,
    GO_TO_PAGE,
    // usePdfViewHistory.ts: Previous view and Next view.
    GO_TO_PREVIOUS_VIEW,
    GO_TO_NEXT_VIEW,
    ROTATE_VIEW_CLOCKWISE,
    ROTATE_VIEW_COUNTERCLOCKWISE,
    // pdf-panels.ts: the left panels built (reading-surface.md "The left panel").
    PANEL_THUMBNAILS,
    PANEL_OUTLINE,
    PANEL_EMBEDDED_FILES,
    PANEL_LAYERS,
    // usePdfReadMode.ts, usePdfFullScreen.ts: one person's room for the pages.
    READ_MODE,
    FULL_SCREEN,
    // usePdfDarkPages.ts: bound in the dark scheme.
    DARK_PAGES,
  ];

  it('has no built item nothing runs, no shortcut its registry lacks, no id twice', () => {
    expect(
      catalogueFaults(PDF_MENUS, { bound: BOUND, shortcuts: PDF_SHORTCUTS.map((row) => row.id) }),
    ).toEqual([]);
  });

  // office-shell.md "Menus as data": what is not built is `comingSoon`, so what is built is exactly what runs.
  it('calls built what the surface or the shell runs, and nothing else', () => {
    const built = catalogueItems(PDF_MENUS)
      .filter(({ item }) => item.status === 'built')
      .map(({ item }) => item.id);
    // File > Open is the shell's where a kind hands it a file picker; a PDF's waits on how one is started.
    expect(built.toSorted()).toEqual(BOUND.filter((id) => id !== 'open').toSorted());
  });

  // office-shell.md "Toolbar": a control that runs a menu item shares the item's id, so one binding serves both.
  it('builds a control as far as the menu item it runs, for the same levels', () => {
    const items = new Map(catalogueItems(PDF_MENUS).map(({ item }) => [item.id, item]));
    const shared = PDF_MODES.flatMap((mode) => pdfToolbar(mode.mode))
      .flatMap((group) => group.controls)
      .filter((control) => items.has(control.id));
    expect(shared.length).toBeGreaterThan(15);
    for (const control of shared) {
      const item = items.get(control.id)!;
      expect([control.id, control.status, control.level]).toEqual([
        item.id,
        item.status,
        item.level,
      ]);
    }
  });

  it('gives no two controls of a toolbar one id', () => {
    for (const mode of PDF_MODES) {
      const ids = pdfToolbar(mode.mode).flatMap((group) => group.controls.map((c) => c.id));
      expect(new Set(ids).size, mode.label).toBe(ids.length);
    }
  });

  it('binds each built mode’s menu item to its mode', () => {
    const items = catalogueItems(PDF_MENUS).map(({ item }) => item.id);
    for (const mode of PDF_MODES) expect(items).toContain(mode.item);
  });

  // reading-surface.md "Share roles": an item above the session's level is not drawn.
  it('shows a Viewer the download and no tool that marks', () => {
    const actions = Object.fromEntries(
      [...BOUND, TEXT_MARK_TOOLS, TYPED_TOOLS, DRAWING_TOOLS, SHAPE_TOOLS, STAMP_TOOLS].map(
        (id) => [id, { run: () => {} }],
      ),
    );
    const seen = (level: 'view' | 'participate') =>
      catalogueItems(visibleMenus(PDF_MENUS, level, actions)).map(({ item }) => item.id);
    expect(seen('view')).toContain(DOWNLOAD_PDF);
    expect(seen('view')).not.toContain(TOOL_HIGHLIGHT);
    expect(seen('participate')).toContain(TOOL_HIGHLIGHT);
    // Undo and Redo are the person's own changes: hidden from who can make none ("The toolbar": hidden in Viewing).
    expect(seen('view')).not.toContain(UNDO);
    expect(seen('participate')).toEqual(expect.arrayContaining([UNDO, REDO]));
    const fields = { zoom: false, fontSize: false, font: false, colour: false, choice: false };
    // What runs today; the controls beside them are drawn dimmed until their phases land.
    const controls = (mode: PdfMode, level: 'view' | 'participate') =>
      visibleToolbar(pdfToolbar(mode), level, actions, fields, CHOICES)
        .flatMap((group) => group.controls)
        .filter((control) => control.status === 'built')
        .map((control) => control.id);
    // The zoom is the page bar's, never the toolbar's ("The page bar").
    expect(controls('viewing', 'view')).toEqual([
      PRINT,
      FIND,
      TOOL_SELECT,
      PAGE_DISPLAY_CONTROL,
      ROTATE_VIEW_CLOCKWISE,
      DARK_PAGES,
    ]);
    expect(controls('reviewing', 'participate')).toEqual([
      UNDO,
      REDO,
      PRINT,
      FIND,
      TOOL_SELECT,
      TEXT_MARK_TOOLS,
      TYPED_TOOLS,
      DRAWING_TOOLS,
      SHAPE_TOOLS,
      STAMP_TOOLS,
    ]);
    // "The toolbar": a mode's own tools are not another mode's.
    const labels = (mode: PdfMode) =>
      visibleToolbar(pdfToolbar(mode), 'edit', actions, fields, CHOICES).flatMap((group) =>
        group.controls.map((control) => control.label),
      );
    expect(labels('viewing')).toContain('Page display');
    expect(labels('viewing')).not.toContain('Highlight');
    expect(labels('reviewing')).not.toContain('Page display');
    expect(labels('editing')).toEqual(expect.arrayContaining(['Edit text', 'Organise pages']));
    expect(labels('editing')).not.toContain('Highlight');
  });

  // keyboard-shortcuts.md "Tools": Select V, Highlight U, Drawing D, Text X, Stamp K, Cloud Q; the modes' keys are a text document's.
  it('keeps the tools’ own keys and the modes’ shared ones', () => {
    expect(PDF_TOOL_KEYS).toEqual({
      select: 'v',
      highlight: 'u',
      drawing: 'd',
      text: 'x',
      stamp: 'k',
      cloud: 'q',
    });
    const keys = Object.fromEntries(PDF_SHORTCUTS.map((row) => [row.id, row.keys.pc]));
    expect(keys['switch-to-reviewing']).toBe('Ctrl+Alt+Shift+X');
    expect(keys['switch-to-editing']).toBe('Ctrl+Alt+Shift+Z');
    expect(keys['switch-to-viewing']).toBe('Ctrl+Alt+Shift+C');
    // keyboard-shortcuts.md "Marks and comments": Undo and redo, a text document's keys.
    expect([keys['undo'], keys['redo']]).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z']);
    expect(new Set(PDF_SHORTCUTS.map((row) => row.id)).size).toBe(PDF_SHORTCUTS.length);
  });
});
