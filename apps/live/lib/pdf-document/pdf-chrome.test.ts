// docs/specs/035-pdf-documents/editing-modes.md "Switching", "Share roles"; reading-surface.md "Menus", "The
// toolbar"; keyboard-shortcuts.md: a PDF document's modes, menus, toolbar and shortcuts as the office shell's data.
import { describe, expect, it } from 'vitest';
import { catalogueFaults, catalogueItems, visibleMenus } from '@/lib/office/office-catalogue';
import { levelInMode, modesFor, startingMode } from '@/lib/office/office-mode';
import { visibleToolbar } from '@/lib/office/office-toolbar';
import { SHELL_BOUND_ITEMS } from '@/lib/office/office-catalogue';
import { DOWNLOAD_PDF, PDF_MENUS, REDO, TOOL_HIGHLIGHT, TOOL_SELECT, UNDO } from './pdf-menus';
import { PDF_MODES } from './pdf-modes';
import { PDF_REFUSAL_COPY, pdfRefusalDownloads, pdfRefusalRetries } from './pdf-refusals';
import { PDF_SHORTCUTS, PDF_TOOL_KEYS } from './pdf-shortcuts';
import { PDF_TOOLBAR } from './pdf-toolbar';

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
  ];

  it('has no built item nothing runs, no shortcut its registry lacks, no id twice', () => {
    expect(
      catalogueFaults(PDF_MENUS, { bound: BOUND, shortcuts: PDF_SHORTCUTS.map((row) => row.id) }),
    ).toEqual([]);
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
    const fields = { zoom: true, fontSize: false, font: false, colour: false, choice: false };
    const controls = (level: 'view' | 'participate') =>
      visibleToolbar(PDF_TOOLBAR, level, actions, fields).flatMap((group) =>
        group.controls.map((control) => control.id),
      );
    expect(controls('view')).toEqual(['zoom', TOOL_SELECT]);
    expect(controls('participate')).toEqual([UNDO, REDO, 'zoom', TOOL_SELECT, TOOL_HIGHLIGHT]);
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
