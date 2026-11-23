// docs/specs/035-pdf-documents/editing-modes.md "Switching", "Share roles"; reading-surface.md "Menus", "The
// toolbar"; keyboard-shortcuts.md: a PDF document's modes, menus, toolbar and shortcuts as the office shell's data.
import { describe, expect, it } from 'vitest';
import { catalogueFaults, catalogueItems, visibleMenus } from '@/lib/office/office-catalogue';
import { levelInMode, modesFor, startingMode } from '@/lib/office/office-mode';
import { visibleToolbar } from '@/lib/office/office-toolbar';
import { SHELL_BOUND_ITEMS } from '@/lib/office/office-catalogue';
import {
  DOWNLOAD_PDF,
  GO_TO_FIRST_PAGE,
  GO_TO_LAST_PAGE,
  GO_TO_NEXT_PAGE,
  GO_TO_PAGE,
  GO_TO_PREVIOUS_PAGE,
  PAGE_DISPLAY_CONTINUOUS,
  PAGE_DISPLAY_COVER,
  PAGE_DISPLAY_SINGLE,
  PAGE_DISPLAY_TWO,
  PAGE_DISPLAY_TWO_CONTINUOUS,
  PDF_MENUS,
  PDF_ZOOM_MENU_PERCENTS,
  REDO,
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  UNDO,
  ZOOM_ACTUAL_SIZE,
  ZOOM_FIT_PAGE,
  ZOOM_FIT_WIDTH,
  ZOOM_IN,
  ZOOM_OUT,
  zoomPercentId,
} from './pdf-menus';
import { PDF_MODES, type PdfMode } from './pdf-modes';
import { PDF_REFUSAL_COPY, pdfRefusalDownloads, pdfRefusalRetries } from './pdf-refusals';
import { PDF_SHORTCUTS, PDF_TOOL_KEYS } from './pdf-shortcuts';
import { PAGE_DISPLAY_CONTROL, pdfToolbar } from './pdf-toolbar';

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
    UNDO,
    REDO,
    TOOL_SELECT,
    TOOL_HIGHLIGHT,
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
    const actions = Object.fromEntries(BOUND.map((id) => [id, { run: () => {} }]));
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
    expect(controls('viewing', 'view')).toEqual([TOOL_SELECT, PAGE_DISPLAY_CONTROL]);
    expect(controls('reviewing', 'participate')).toEqual([UNDO, REDO, TOOL_SELECT, TOOL_HIGHLIGHT]);
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

  // keyboard-shortcuts.md "Tools": Select V, Highlight U; the modes' keys are a text document's for the same places.
  it('keeps the tools’ own keys and the modes’ shared ones', () => {
    expect(PDF_TOOL_KEYS).toEqual({ select: 'v', highlight: 'u' });
    const keys = Object.fromEntries(PDF_SHORTCUTS.map((row) => [row.id, row.keys.pc]));
    expect(keys['switch-to-reviewing']).toBe('Ctrl+Alt+Shift+X');
    expect(keys['switch-to-editing']).toBe('Ctrl+Alt+Shift+Z');
    expect(keys['switch-to-viewing']).toBe('Ctrl+Alt+Shift+C');
    // keyboard-shortcuts.md "Marks and comments": Undo and redo, a text document's keys.
    expect([keys['undo'], keys['redo']]).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z']);
    expect(new Set(PDF_SHORTCUTS.map((row) => row.id)).size).toBe(PDF_SHORTCUTS.length);
  });
});

// opening.md "Refusals": one sentence a refusal, Download wherever the bytes are held, Try again after a stop.
describe('what a refusal says and offers', () => {
  it('has copy for every refusal, ending as a sentence', () => {
    for (const sentence of Object.values(PDF_REFUSAL_COPY)) expect(sentence).toMatch(/\.$/);
    expect(PDF_REFUSAL_COPY.pdf_damaged).toBe(
      "This PDF is damaged and can't be opened. You can still download the file.",
    );
  });

  it('offers Download unless the bytes are not held, and Try again only after a stop', () => {
    expect(pdfRefusalDownloads('pdf_damaged')).toBe(true);
    expect(pdfRefusalDownloads('pdf_password')).toBe(true);
    expect(pdfRefusalDownloads('blob_missing')).toBe(false);
    expect(pdfRefusalDownloads('files_unavailable')).toBe(false);
    expect(pdfRefusalRetries('pdf_stopped')).toBe(true);
    expect(pdfRefusalRetries('pdf_damaged')).toBe(false);
  });
});
