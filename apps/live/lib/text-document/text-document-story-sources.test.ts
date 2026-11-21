// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Headers and footers": a header's writing laid out once, from its
// fragment in the live state, read only; its copies drawn on the pages; its height and emptiness told.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Styles, storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { STORY_CLASS, StorySource } from './text-document-story-sources';

const formatting = { styles: Styles.builtIn('odf'), defaults: Styles.defaults() };

function storyDoc(text: string) {
  const doc = TextDocumentState.load();
  const paragraph = new Y.XmlElement('paragraph');
  if (text) paragraph.insert(0, [new Y.XmlText(text)]);
  storyFragment(doc, 's').insert(0, [paragraph]);
  return doc;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function source(doc: Y.Doc, onLaid = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  const made = new StorySource({
    doc,
    format: 'odf',
    story: 's',
    key: 's@300',
    width: 300,
    container,
    readFormatting: () => formatting,
    stylesScope: 'scope',
    onLaid,
  });
  return { made, container, onLaid };
}

// The source's own resize listener: its type loaded, its height read again.
let resized: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly #call: () => void;
      constructor(call: () => void) {
        this.#call = call;
      }
      observe(target: Element) {
        if ((target as HTMLElement).dataset.storySource) resized = this.#call;
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  resized = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('StorySource', () => {
  it('lays the story out read only, at its width, in the document’s styles', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
    const { made, container, onLaid } = source(storyDoc('Header'));
    await settle();
    const host = container.querySelector<HTMLElement>('[data-story-source="s@300"]')!;
    expect(host.style.width).toBe('300px');
    expect(made.view.editable).toBe(false);
    expect(made.view.dom.getAttribute('data-text-document-styles')).toBe('scope');
    expect(made.empty).toBe(false);
    expect(made.height).toBe(18);
    expect(onLaid).toHaveBeenCalledTimes(1);
  });

  it('reads its height again when it resizes, telling only a change', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
    const { made, onLaid } = source(storyDoc('Header'));
    await settle();
    resized!();
    expect(onLaid).toHaveBeenCalledTimes(1);
    height.mockReturnValue(30);
    resized!();
    expect(made.height).toBe(30);
    expect(onLaid).toHaveBeenCalledTimes(2);
    made.destroy();
    resized!();
    expect(onLaid).toHaveBeenCalledTimes(2);
  });

  it('copies its writing for a page, never editable', async () => {
    const { made } = source(storyDoc('Header'));
    await settle();
    const copy = made.copy();
    expect(copy.classList.contains(STORY_CLASS)).toBe(true);
    expect(copy.textContent).toBe('Header');
    expect(copy.hasAttribute('contenteditable')).toBe(false);
  });

  it('reads one empty paragraph as empty, of no height', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
    const { made, onLaid } = source(storyDoc(''));
    await settle();
    expect(made.empty).toBe(true);
    expect(made.height).toBe(0);
    expect(onLaid).not.toHaveBeenCalled();
  });

  it('paints its copies again when its writing changes in the live state', async () => {
    const doc = storyDoc('Header');
    const { made } = source(doc);
    await settle();
    const paint = vi.fn();
    const stop = made.subscribe(paint);
    const text = (storyFragment(doc, 's').get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.insert(6, ' two');
    await settle();
    expect(paint).toHaveBeenCalled();
    expect(made.copy().textContent).toBe('Header two');
    stop();
    paint.mockClear();
    text.insert(0, 'A ');
    await settle();
    expect(paint).not.toHaveBeenCalled();
  });

  it('takes its hidden place away when destroyed', async () => {
    const { made, container } = source(storyDoc('Header'));
    made.destroy();
    expect(container.children).toHaveLength(0);
    expect(made.view.isDestroyed).toBe(true);
    await settle();
  });
});
