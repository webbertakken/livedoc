// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Tab stops": each tab drawn to the next stop past where it
// starts, by its alignment, with its leader; laid out again where the writing changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Styles, type ParagraphProps, type TabStop } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  firstChanges,
  layTabs,
  relayTextDocumentTabs,
  TAB_CLASS,
  tabDecorations,
  tabRulesOf,
  tabStopsPlugin,
  touchedParagraphs,
  type TabMeasure,
} from './text-document-tab-layout';

const p = (text: string, props: ParagraphProps | null = null, style: string | null = null) =>
  schema.nodes.paragraph!.create({ props, style }, text ? schema.text(text) : undefined);
const formatting = { styles: Styles.builtIn('odf'), defaults: Styles.defaults() };

function fake(x: number, after: number) {
  const drawn: { width: number; leader: string | undefined }[] = [];
  const measure: TabMeasure = {
    start: () => x,
    after: () => after,
    draw: (width, leader) => drawn.push({ width, leader }),
  };
  return { measure, drawn };
}

describe('layTabs', () => {
  it('gives each tab the space to its stop, less the text after it by the stop alignment', () => {
    const stops: TabStop[] = [
      { position: 100, align: 'center', leader: 'dot' },
      { position: 300, align: 'end' },
    ];
    const a = fake(20, 40);
    const b = fake(150, 50);
    const c = fake(320, 10);
    layTabs([a.measure, b.measure, c.measure], { stops, interval: 36 });
    expect(a.drawn).toEqual([{ width: 60, leader: 'dot' }]);
    expect(b.drawn).toEqual([{ width: 100, leader: undefined }]);
    expect(c.drawn).toEqual([{ width: 4, leader: undefined }]);
  });

  it('never asks a start stop for the text after it', () => {
    const after = vi.fn(() => 99);
    const drawn: number[] = [];
    layTabs([{ start: () => 10, after, draw: (w) => drawn.push(w) }], { stops: [] });
    expect(drawn).toEqual([26]);
    expect(after).not.toHaveBeenCalled();
  });
});

describe('tabRulesOf', () => {
  it("reads a paragraph's own stops over its style's, the document's interval and a hanging indent", () => {
    const stops: TabStop[] = [{ position: 50, align: 'start' }];
    const styled = {
      ...formatting,
      styles: formatting.styles.map((s) =>
        s.role === 'normal' ? { ...s, paragraph: { ...s.paragraph, tabStops: stops } } : s,
      ),
    };
    expect(tabRulesOf(p('a'), styled)).toEqual({ stops, interval: 36 });
    expect(tabRulesOf(p('a', { tabStops: [], indentStart: 36, indentFirst: -18 }), styled)).toEqual(
      {
        stops: [],
        interval: 36,
        hanging: 36,
      },
    );
    expect(
      tabRulesOf(p('a', { indentFirst: -18 }), {
        ...formatting,
        defaults: { paragraph: {}, text: {} },
      }),
    ).toEqual({
      stops: [],
      hanging: 0,
    });
  });
});

describe('tab decorations', () => {
  it('marks every tab character, and follows the writing as it changes', () => {
    const doc = schema.node('doc', null, [p('a\tb\tc'), p('none'), p('\t')]);
    const boxes = (set: ReturnType<typeof tabDecorations>) =>
      set
        .find()
        .filter((d) => (d.spec as { side?: number }).side === 1)
        .map((d) => d.from);
    expect(boxes(tabDecorations(doc))).toEqual([2, 4, 14]);
    expect(tabDecorations(doc).find()).toHaveLength(6);
    expect(tabDecorations(schema.node('doc', null, [p('')])).find()).toEqual([]);

    const plugin = tabStopsPlugin(() => formatting);
    let state = EditorState.create({ doc, plugins: [plugin] });
    const decorations = () => boxes(plugin.getState(state)!.decorations);
    state = state.apply(state.tr.insertText('\t', 9));
    expect(decorations()).toEqual([2, 4, 9, 15]);
    expect(plugin.getState(state)!.dirty).toEqual([7]);
    state = state.apply(state.tr.delete(2, 3));
    expect(decorations()).toEqual([3, 8, 14]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    expect(plugin.getState(state)!.dirty).toEqual([]);
  });
});

describe('the layout pass', () => {
  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    vi.restoreAllMocks();
  });

  it('sizes each tab box from where it starts, and lays them out again when asked', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    // The body starts at 100 px; the tab boxes at 120 px and 200 px; text after a tab measures 40 px.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains(TAB_CLASS)) {
        const boxes = [...document.querySelectorAll(`.${TAB_CLASS}`)];
        const left = boxes.indexOf(this) === 0 ? 120 : 200;
        return { left, top: 0, width: 0, height: 10, right: left, bottom: 10 } as DOMRect;
      }
      return { left: 100, top: 0, width: 600, height: 100, right: 700, bottom: 100 } as DOMRect;
    });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '600px' } as CSSStyleDeclaration);
    let at = 0;
    vi.spyOn(EditorView.prototype, 'coordsAtPos').mockImplementation(() => {
      at += 40;
      return { left: at, right: at, top: 0, bottom: 10 };
    });
    const stops: TabStop[] = [{ position: 60, align: 'end', leader: 'dot' }];
    view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({
        doc: schema.node('doc', null, [p('a\tb\tc', { tabStops: stops })]),
        plugins: [tabStopsPlugin(() => formatting)],
      }),
    });
    relayTextDocumentTabs(view);
    const boxes = [...view.dom.querySelectorAll<HTMLElement>(`.${TAB_CLASS}`)];
    // The first starts at 15 pt and ends 30 pt of text at 60 pt; the second, at 75 pt, goes to the default 108 pt.
    expect(boxes.map((b) => [b.style.width, b.dataset.leader])).toEqual([
      ['20px', 'dot'],
      ['44px', undefined],
    ]);
  });

  it('measures nothing while the writing is hidden', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({
        doc: schema.node('doc', null, [p('a\tb')]),
        plugins: [tabStopsPlugin(() => formatting)],
      }),
    });
    view.dispatch(view.state.tr.insertText('\t', 1));
    expect(view.dom.querySelector<HTMLElement>(`.${TAB_CLASS}`)!.style.width).toBe('');
  });
});

// performance.md "A keystroke's frame": where an edit began in each paragraph it touched.
describe('firstChanges', () => {
  const para = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
  const state = () =>
    EditorState.create({ doc: schema.node('doc', null, [para('abcdef'), para('ghij')]) });

  it('names each paragraph touched with the first place in it that changed', () => {
    const second = state().doc.child(0).nodeSize;
    const tr = state()
      .tr.insertText('x', 5)
      .insertText('y', second + 4);
    expect([...firstChanges(tr)]).toEqual([
      [0, 5],
      [second + 1, second + 4],
    ]);
  });

  it('starts a paragraph the change began before at its start', () => {
    const tr = state().tr.delete(3, state().doc.child(0).nodeSize + 3);
    expect([...firstChanges(tr)]).toEqual([[0, 3]]);
    expect(touchedParagraphs(tr)).toEqual([0]);
  });
});
