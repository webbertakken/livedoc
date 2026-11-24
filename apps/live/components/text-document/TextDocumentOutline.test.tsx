// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument } from '@livedoc/text-documents';
import { createTextDocumentChanges } from '@/lib/text-document/text-document-changes';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { ADD_TAB_LABEL, OUTLINE_EMPTY, TextDocumentOutline } from './TextDocumentOutline';
import { TAB_NAME_LABEL } from './TextDocumentOutlineTab';
import { TAB_MENU_ITEMS } from '@/lib/text-document/text-document-tab-menu';
import type { TextDocumentTabs } from './useTextDocumentTabs';

// One tab, as every text document has until it is given others.
const tabsOf = (over: Partial<TextDocumentTabs> = {}): TextDocumentTabs => ({
  list: [{ id: 't.0', name: 'Tab 1', depth: 0, body: [] }],
  shown: 't.0',
  canAdd: true,
  canEditTabs: true,
  show: vi.fn(),
  add: vi.fn(),
  step: vi.fn(() => false),
  actions: {},
  menuActions: () => ({}),
  renaming: null,
  finishRename: vi.fn(),
  asking: null,
  pickEmoji: vi.fn(),
  confirmDelete: vi.fn(),
  cancelAsking: vi.fn(),
  said: '',
  ...over,
});

const STYLES = TextDocument.blank({ format: 'odf' }).styles;
const readStyles = () => STYLES;
const { paragraph } = textDocumentSchema.nodes;
const p = (text: string, style: string | null = null) =>
  paragraph!.create({ style }, text ? textDocumentSchema.text(text) : null);

function outlineOf(...blocks: ReturnType<typeof p>[]) {
  return outlineWith(tabsOf(), ...blocks);
}

function outlineWith(tabs: TextDocumentTabs, ...blocks: ReturnType<typeof p>[]) {
  const changes = createTextDocumentChanges();
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc: textDocumentSchema.node('doc', null, blocks),
      plugins: [changes.plugin],
    }),
  });
  render(<TextDocumentOutline view={view} changes={changes} readStyles={readStyles} tabs={tabs} />);
  return view;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// docs/specs/034-text-documents/links-and-navigation.md "The outline".
describe('TextDocumentOutline', () => {
  it('lists the headings indented by level', () => {
    outlineOf(p('Plan', 'Heading_20_1'), p('Words'), p('Steps', 'Heading_20_2'));
    const items = within(screen.getByRole('list', { name: 'Headings' })).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['Plan', 'Steps']);
    expect(items[1]!.style.paddingLeft).toBe('32px');
  });

  it('puts the caret at a heading pressed, and gives the writing the keyboard', () => {
    const view = outlineOf(p('Words'), p('Steps', 'Heading_20_2'));
    fireEvent.click(screen.getByRole('button', { name: 'Steps' }));
    expect(view.state.selection.from).toBe(8);
    expect(document.activeElement).toBe(view.dom);
  });

  it('says where headings will show while there are none', () => {
    outlineOf(p('Words'));
    expect(screen.getByText(OUTLINE_EMPTY)).toBeDefined();
  });

  // performance.md "A keystroke's frame": after the frame that paints the change.
  it('follows the writing as it changes', async () => {
    const view = outlineOf(p('Words'));
    act(() => {
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, p('Later', 'Heading_20_1')));
    });
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Later' })).toBeDefined();
  });

  // links-and-navigation.md "Document tabs in the outline": the tabs, indented by depth, the shown one marked, its
  // headings under it; a press shows a tab; + for an Editor.
  it('lists the document tabs, the shown one marked with its headings under it', () => {
    const tabs = tabsOf({
      list: [
        { id: 't.0', name: 'Intro', depth: 0, body: [] },
        { id: 't.b', name: 'Notes', emoji: '📌', depth: 1, body: [] },
      ],
      shown: 't.b',
    });
    outlineWith(tabs, p('Plan', 'Heading_20_1'));
    const list = screen.getByRole('list', { name: 'Document tabs' });
    const shown = within(list).getByRole('button', { name: 'Notes' });
    expect(shown.getAttribute('aria-current')).toBe('page');
    expect(shown.textContent).toBe('📌Notes');
    expect(shown.style.paddingLeft).toBe('20px');
    expect(
      within(list).getByRole('button', { name: 'Intro' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(shown.closest('li')!.querySelector('ul[aria-label="Headings"]')).not.toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: 'Intro' }));
    expect(tabs.show).toHaveBeenCalledWith('t.0');
  });

  it('adds a tab with + for an Editor, and shows no + to anyone else', () => {
    const tabs = tabsOf();
    outlineWith(tabs, p('Words'));
    fireEvent.click(screen.getByRole('button', { name: ADD_TAB_LABEL }));
    expect(tabs.add).toHaveBeenCalledOnce();
    cleanup();
    outlineWith(tabsOf({ canAdd: false }), p('Words'));
    expect(screen.queryByRole('button', { name: ADD_TAB_LABEL })).toBeNull();
  });

  // "The outline": opened from its menu item, focus starts at the shown tab's first heading, else the shown tab.
  it('marks where focus starts: the first heading, else the shown tab', () => {
    outlineOf(p('Words'), p('Plan', 'Heading_20_1'), p('Steps', 'Heading_20_2'));
    expect(screen.getByRole('button', { name: 'Plan' }).hasAttribute(OFFICE_PANEL_START)).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Steps' }).hasAttribute(OFFICE_PANEL_START)).toBe(
      false,
    );
    expect(screen.getByRole('button', { name: 'Tab 1' }).hasAttribute(OFFICE_PANEL_START)).toBe(
      false,
    );
    cleanup();
    outlineOf(p('Words'));
    expect(screen.getByRole('button', { name: 'Tab 1' }).hasAttribute(OFFICE_PANEL_START)).toBe(
      true,
    );
  });

  // links-and-navigation.md "A tab's menu".
  it('opens a tab’s menu from its Tab options button, its items bound or dimmed', () => {
    const run = vi.fn();
    outlineWith(
      tabsOf({
        menuActions: () =>
          Object.fromEntries(
            Object.values(TAB_MENU_ITEMS).map((id) => [
              id,
              { run, disabled: id === TAB_MENU_ITEMS.delete },
            ]),
          ),
      }),
      p('Words'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tab options: Tab 1' }));
    const menu = screen.getByRole('menu', { name: 'Tab options' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      'Rename',
      'Choose emoji',
      'Remove emoji',
      'Add subtab',
      'Duplicate',
      'Copy link',
      'Move up',
      'Move down',
      'Indent',
      'Outdent',
      'Delete',
    ]);
    expect(
      within(menu).getByRole('menuitem', { name: 'Delete' }).getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('renames in place: Enter keeps the name typed, Escape the old one', () => {
    const tabs = tabsOf({ renaming: 't.0' });
    outlineWith(tabs, p('Words'));
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: TAB_NAME_LABEL });
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('Tab 1');
    fireEvent.change(field, { target: { value: 'Plan' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(tabs.finishRename).toHaveBeenCalledWith('t.0', 'Plan');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(tabs.finishRename).toHaveBeenLastCalledWith('t.0', null);
  });

  it('asks before deleting a tab, counting its subtabs', () => {
    const tabs = tabsOf({
      list: [
        { id: 't.0', name: 'Plan', depth: 0, body: [] },
        { id: 't.a', name: 'Part', depth: 1, body: [] },
        { id: 't.b', name: 'Other', depth: 0, body: [] },
      ],
      asking: { kind: 'delete', id: 't.0' },
    });
    outlineWith(tabs, p('Words'));
    const dialog = screen.getByRole('dialog', { name: 'Delete "Plan"?' });
    expect(dialog.textContent).toContain('This tab, its subtab and their writing will be deleted.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(tabs.confirmDelete).toHaveBeenCalledOnce();
  });

  it('opens the emoji dialog when asked, and says what was done aloud', () => {
    outlineWith(tabsOf({ asking: { kind: 'emoji', id: 't.0' }, said: 'Link copied' }), p('Words'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Link copied').getAttribute('aria-live')).toBe('polite');
  });
});
