// @vitest-environment jsdom
// docs/specs/034-text-documents/editing-surface.md "The ruler": markers as sliders an Editor moves with the keys, the
// add-a-tab-stop menu from the keyboard, margins set on the page's setup, and a read-only ruler for other roles.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PageSetup, TextDocument, type ParagraphProps } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { TextDocumentRuler } from './TextDocumentRuler';

const blank = TextDocument.blank({ format: 'odf' });
const formatting = { styles: blank.styles, defaults: blank.defaults };
const setup = PageSetup.of('letter');

// jsdom lays nothing out: the editor's focus asks where text is.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function mount(props: ParagraphProps | null, canEdit = true, pageless = false) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create({ props }, schema.text('Some writing')),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
  });
  const onSetup = vi.fn();
  render(
    <TextDocumentRuler
      view={view}
      readFormatting={() => formatting}
      setup={setup}
      pageless={pageless}
      onSetup={onSetup}
      scale={1}
      canEdit={canEdit}
      refresh={() => () => {}}
      guideHeight={() => 400}
    />,
  );
  const own = () => (view!.state.doc.child(0).attrs as { props: ParagraphProps | null }).props;
  return { onSetup, own };
}

describe('TextDocumentRuler', () => {
  it('draws each marker as a slider with its value in inches', () => {
    mount({ indentStart: 36, tabStops: [{ position: 144, align: 'end' }] });
    expect(screen.getByRole('slider', { name: 'Left indent' }).getAttribute('aria-valuetext')).toBe(
      '0.5 in',
    );
    expect(
      screen.getByRole('slider', { name: 'Right tab stop' }).getAttribute('aria-valuetext'),
    ).toBe('2 in');
    expect(screen.getByRole('slider', { name: 'Left margin' }).getAttribute('aria-valuetext')).toBe(
      '1 in',
    );
  });

  it('moves an indent by an eighth, a whole inch with Shift, and takes a tab stop away with Delete', () => {
    const { own } = mount({ tabStops: [{ position: 144, align: 'start' }] });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Left indent' }), { key: 'ArrowRight' });
    expect(own()).toMatchObject({ indentStart: 9 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Right indent' }), {
      key: 'ArrowLeft',
      shiftKey: true,
    });
    expect(own()).toMatchObject({ indentEnd: 72 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Left tab stop' }), { key: 'Delete' });
    expect(own()).toMatchObject({ tabStops: [] });
    expect(view!.hasFocus() || document.activeElement === view!.dom).toBe(true);
  });

  it("sets a margin on the page's setup", () => {
    const { onSetup } = mount(null);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Right margin' }), { key: 'ArrowRight' });
    expect(onSetup).toHaveBeenCalledWith({ ...setup, margins: { ...setup.margins, right: 63 } });
  });

  it('opens the add menu from the keyboard and adds a stop past the last', async () => {
    const { own } = mount({ tabStops: [{ position: 36, align: 'start' }] });
    const strip = screen.getByRole('group', { name: 'Ruler. Enter adds a tab stop' });
    strip.getBoundingClientRect = () => ({ left: 0, width: 816, bottom: 24 }) as DOMRect;
    fireEvent.keyDown(strip, { key: 'Enter' });
    const menu = await screen.findByRole('menu', { name: 'Add tab stop' });
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ['Add left tab stop', 'Add centre tab stop', 'Add right tab stop'],
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Add right tab stop' }));
    });
    expect(own()).toMatchObject({
      tabStops: [
        { position: 36, align: 'start' },
        { position: 45, align: 'end' },
      ],
    });
  });

  // docs/specs/034-text-documents/page-layout.md "Pageless": the ruler spans the column, no margins to drag.
  it('draws no margins pageless, keeping the indents', () => {
    mount({ indentStart: 36 }, true, true);
    expect(screen.queryByRole('slider', { name: 'Left margin' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Right margin' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Left indent' })).toBeTruthy();
  });

  it('draws the markers for a Viewer without letting them move', () => {
    mount({ indentStart: 36 }, false);
    const slider = screen.getByRole('slider', { name: 'Left indent' });
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    expect(slider.hasAttribute('tabindex')).toBe(false);
    expect(screen.getByRole('group', { name: 'Ruler' }).hasAttribute('tabindex')).toBe(false);
  });
});
