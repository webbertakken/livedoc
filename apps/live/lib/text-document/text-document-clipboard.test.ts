// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": Copy and Cut put HTML, plain text and the model
// fragment on the clipboard; Paste reads the fragment first (as copied in its own tab, in this document's terms in
// another), else the HTML, else the text; its new lists are written; Edit menu items ask the browser, and say so when
// it refuses.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllSelection, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ListDefinition, Styles, type ListDefinition as List } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { clipboardActions, clipboardPlugin } from './text-document-clipboard';
import type { FragmentContext } from './text-document-clipboard-fragment';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

// jsdom lays nothing out: the selection scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeAll(() => {
  // jsdom has no ClipboardEvent; ProseMirror makes one for a paste the menu runs.
  globalThis.ClipboardEvent ??= class extends Event {
    clipboardData = null;
  } as unknown as typeof ClipboardEvent;
});

class FakeData {
  data = new Map<string, string>();
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? '';
  }
  clearData() {
    this.data.clear();
  }
  get types() {
    return [...this.data.keys()];
  }
}

function clipboardEvent(type: 'copy' | 'cut' | 'paste', data: FakeData): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  return event;
}

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  track.mockReset();
});

type Editor = { view: EditorView; added: [string, List][]; leftOut: number[] };

function editor(
  context: FragmentContext,
  nodes = [schema.nodes.paragraph!.create()],
  editable = true,
  markdown = false,
): Editor {
  const added: [string, List][] = [];
  const leftOut: number[] = [];
  const lists: Record<string, List> = { ...context.lists };
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc: schema.node('doc', null, nodes),
      plugins: [
        clipboardPlugin({
          read: () => ({ ...context, lists }),
          lists: {
            read: () => lists,
            set: (id, list) => {
              added.push([id, list]);
              lists[id] = list;
            },
          },
          onLeftOut: (n) => leftOut.push(n),
          markdown: () => markdown,
        }),
      ],
    }),
    editable: () => editable,
  });
  views.push(view);
  return { view, added, leftOut };
}

const odf: FragmentContext = {
  documentId: 'd1',
  tabId: 't1',
  format: 'odf',
  styles: Styles.builtIn('odf'),
  defaults: Styles.defaults(),
  lists: { L1: ListDefinition.of('number') },
};
const ooxml: FragmentContext = {
  ...odf,
  documentId: 'd2',
  tabId: 't2',
  format: 'ooxml',
  styles: Styles.builtIn('ooxml'),
  lists: {},
};

const source = () => [
  schema.nodes.paragraph!.create({ style: 'Heading_20_1' }, schema.text('Title')),
  schema.nodes.paragraph!.create({ style: 'Standard', list: { id: 'L1', level: 0 } }, [
    schema.text('item'),
    schema.nodes.kept_inline!.create({ name: 'field' }),
  ]),
];

function selectAll(view: EditorView) {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1),
    ),
  );
}

function copied(cut = false, editable = true): { data: FakeData; from: Editor } {
  const from = editor(odf, source(), editable);
  selectAll(from.view);
  const data = new FakeData();
  from.view.dom.dispatchEvent(clipboardEvent(cut ? 'cut' : 'copy', data));
  return { data, from };
}

const paragraphs = (view: EditorView) =>
  view.state.doc.children.map((n): Record<string, unknown> => ({
    ...n.attrs,
    content: n.textContent,
  }));

describe('copy and cut', () => {
  it('put HTML carrying the fragment and plain text on the clipboard, at any share level', () => {
    const { data, from } = copied(false, false);
    expect(data.getData('text/html')).toContain('data-livedoc-fragment');
    expect(data.getData('text/html')).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(data.getData('text/plain')).toBe('Title\n1. item');
    expect(from.view.state.doc.textContent).toBe('Titleitem');
  });

  it('cuts the selection where the person may edit', () => {
    const { from } = copied(true);
    expect(from.view.state.doc.textContent).toBe('');
  });

  it('leaves an empty selection to the browser', () => {
    const { view } = editor(odf, source());
    const data = new FakeData();
    const event = clipboardEvent('copy', data);
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(data.types).toEqual([]);
  });
});

describe('paste', () => {
  it('places a fragment as copied in the tab it came from, kept content and list included', () => {
    const { data } = copied();
    const into = editor(odf);
    into.view.pasteHTML(data.getData('text/html'));
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'Title', style: 'Heading_20_1' },
      { style: 'Standard', list: { id: 'L1', level: 0 } },
    ]);
    expect(into.view.state.doc.lastChild!.lastChild!.type.name).toBe('kept_inline');
    expect(into.added).toEqual([]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentPasteDocument');
  });

  it("places a fragment from another document in this one's terms, leaving kept content out", () => {
    const { data } = copied();
    const into = editor(ooxml);
    into.view.pasteHTML(data.getData('text/html'));
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'Title', style: 'Heading1' },
      { content: 'item', style: 'Normal', list: { id: 'L1', level: 0 } },
    ]);
    expect(into.added).toEqual([['L1', ListDefinition.of('number')]]);
    expect(into.leftOut).toEqual([1]);
  });

  it("gives an empty paragraph the first pasted paragraph's style, from a whole document copied", () => {
    const from = editor(odf, source());
    from.view.dispatch(from.view.state.tr.setSelection(new AllSelection(from.view.state.doc)));
    const data = new FakeData();
    from.view.dom.dispatchEvent(clipboardEvent('copy', data));
    const into = editor(odf);
    into.view.pasteHTML(data.getData('text/html'));
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'Title', style: 'Heading_20_1' },
      { content: 'item' },
    ]);
  });

  it('reads HTML from elsewhere: headings by role, lists made', () => {
    const into = editor(ooxml);
    into.view.pasteHTML('<h2>Head</h2><ol><li>one</li><li>two</li></ol>');
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'Head', style: 'Heading2' },
      { content: 'one', list: { id: 'L1', level: 0 } },
      { content: 'two', list: { id: 'L1', level: 0 } },
    ]);
    expect(into.added).toEqual([['L1', ListDefinition.of('number')]]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentPasteHtml');
  });

  it('reads a fragment LiveDoc did not write as the HTML it is in', () => {
    const into = editor(odf);
    into.view.pasteHTML('<p data-livedoc-fragment="{&quot;v&quot;:9}">plain</p>');
    expect(paragraphs(into.view)).toMatchObject([{ content: 'plain', style: null }]);
  });

  it('reads plain text as a paragraph per line, in the formatting at the caret', () => {
    const into = editor(odf, [schema.nodes.paragraph!.create({ style: 'Heading_20_1' })]);
    into.view.pasteText('a\nb');
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'a', style: 'Heading_20_1' },
      { content: 'b', style: 'Heading_20_1' },
    ]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentPastePlain');
  });

  it('reads Markdown text as Markdown when the person reads it so, but never without formatting', () => {
    const into = editor(ooxml, undefined, true, true);
    const data = new FakeData();
    data.setData('text/plain', '# Plan\n\n- **one**\n- two');
    into.view.dom.dispatchEvent(clipboardEvent('paste', data));
    expect(paragraphs(into.view)).toMatchObject([
      { content: 'Plan', style: 'Heading1' },
      { content: 'one', list: { id: 'L1', level: 0 } },
      { content: 'two', list: { id: 'L1', level: 0 } },
    ]);
    expect(into.added).toEqual([['L1', ListDefinition.of('bullet')]]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentPasteMarkdown');
    const plain = editor(ooxml, undefined, true, true);
    plain.view.someProp('handlePaste', () => false);
    const slice = plain.view.someProp('clipboardTextParser', (f) =>
      f('# Plan', plain.view.state.selection.$from, true, plain.view),
    );
    expect(slice!.content.firstChild!.textContent).toBe('# Plan');
    const off = editor(ooxml);
    const offData = new FakeData();
    offData.setData('text/plain', '# Plan');
    off.view.dom.dispatchEvent(clipboardEvent('paste', offData));
    expect(paragraphs(off.view)).toMatchObject([{ content: '# Plan' }]);
  });

  it('writes the lists of text dropped in from outside', () => {
    const into = editor(ooxml);
    const plugin = into.view.state.plugins[0]!;
    const props = plugin.props;
    props.transformPastedHTML!.call(plugin, '<ul><li>a</li></ul>', into.view);
    const slice = props.transformPasted!.call(
      plugin,
      props.clipboardParser!.parseSlice(
        Object.assign(document.createElement('div'), {
          innerHTML:
            '<ul><li data-livedoc-paste-list="{&quot;key&quot;:&quot;html-1&quot;,&quot;level&quot;:0}">a</li></ul>',
        }),
      ),
      into.view,
      false,
    );
    expect(
      props.handleDrop!.call(plugin, into.view, new Event('drop') as DragEvent, slice, false),
    ).toBe(false);
    expect(into.added).toEqual([['L1', ListDefinition.of('bullet')]]);
  });
});

describe('clipboardActions', () => {
  let execCommand: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  });

  it('copies and cuts through the browser, dimmed while nothing is selected', () => {
    const { view } = editor(odf, source());
    const onRefused = vi.fn();
    const actions = clipboardActions(view, { canEdit: true, onRefused });
    expect(actions.copy!.disabled).toBe(true);
    selectAll(view);
    expect(actions.cut!.disabled).toBe(false);
    actions.copy!.run();
    actions.cut!.run();
    expect(execCommand.mock.calls).toEqual([['copy'], ['cut']]);
    execCommand.mockReturnValue(false);
    actions.copy!.run();
    expect(onRefused).toHaveBeenCalledTimes(1);
  });

  it('offers only Copy where the person may not edit', () => {
    expect(Object.keys(clipboardActions(null, { canEdit: false, onRefused: () => {} }))).toEqual([
      'copy',
    ]);
  });

  it('pastes what the browser gives, and says so when it refuses', async () => {
    const { view } = editor(odf);
    const onRefused = vi.fn();
    const html = new Blob(['<p>from html</p>'], { type: 'text/html' });
    const clipboard = {
      read: vi.fn(async () => [{ types: ['text/html'], getType: async () => html }]),
      readText: vi.fn(async () => 'from text'),
    };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    const actions = clipboardActions(view, { canEdit: true, onRefused });
    actions.paste!.run();
    await vi.waitFor(() => expect(view.state.doc.textContent).toBe('from html'));
    actions['paste-without-formatting']!.run();
    await vi.waitFor(() => expect(view.state.doc.textContent).toBe('from htmlfrom text'));
    clipboard.read.mockRejectedValueOnce(new Error('denied'));
    actions.paste!.run();
    await vi.waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    actions.paste!.run();
    expect(onRefused).toHaveBeenCalledTimes(2);
  });
});
