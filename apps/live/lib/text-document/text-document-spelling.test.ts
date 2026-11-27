// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { SpellingChecker } from '@/lib/spelling/spelling-checker';
import type { SpellingLanguage } from '@/lib/spelling/spelling-languages';
import { PersonalDictionary } from '@/lib/spelling/personal-dictionary';
import { textDocumentSchema } from './text-document-schema';
import {
  ignoreMisspelling,
  MISSPELT_CLASS,
  misspellingAt,
  rescanSpelling,
  SPELLING_IDLE_MS,
  spellingPlugin,
  type SpellingSource,
} from './text-document-spelling';

// docs/specs/034-text-documents/tools.md "Spelling and grammar".

const s = textDocumentSchema;
const paragraph = (...content: PmNode[]) => s.node('paragraph', null, content);
const docOf = (...paragraphs: PmNode[]) => s.node('doc', null, paragraphs);

const KNOWN = new Set(['the', 'cat', 'sat', 'a', 'on', 'mat', 'der', 'Hund']);

// A checker that knows KNOWN in every language; each answer waits for `release` while `held` is set.
function fakeChecker() {
  const asked: { language: SpellingLanguage; words: readonly string[] }[] = [];
  const gate = { held: false, waiting: [] as (() => void)[] };
  const checker: SpellingChecker = {
    check: async (language, words) => {
      asked.push({ language, words });
      if (gate.held) await new Promise<void>((resolve) => gate.waiting.push(resolve));
      return new Set(words.filter((w) => !KNOWN.has(w)));
    },
    known: () => undefined,
    suggest: () => Promise.resolve([]),
  };
  const release = () => gate.waiting.splice(0).forEach((r) => r());
  return { checker, asked, gate, release };
}

const views: EditorView[] = [];
function editorOf(doc: PmNode, source: Partial<SpellingSource> = {}) {
  const fake = fakeChecker();
  const full: SpellingSource = {
    checker: fake.checker,
    language: () => 'nl',
    personal: () => PersonalDictionary.empty(),
    shown: () => true,
    ...source,
  };
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [spellingPlugin(full)] }),
  });
  views.push(view);
  return { view, ...fake };
}

const underlined = (view: EditorView) =>
  [...view.dom.querySelectorAll(`.${MISSPELT_CLASS}`)].map((el) => el.textContent);
const pause = () => vi.advanceTimersByTimeAsync(SPELLING_IDLE_MS);
// Inserts `text` at `at`, then puts the caret at `caret` (after the insertion when not given).
const type = (view: EditorView, at: number, text: string, caret = at + text.length) => {
  const tr = view.state.tr.insertText(text, at);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  views.splice(0).forEach((v) => v.destroy());
  vi.useRealTimers();
});

describe('spellingPlugin', () => {
  it('underlines each misspelt word once typing pauses, naming the word', async () => {
    const { view } = editorOf(
      docOf(paragraph(s.text('teh cat sat')), paragraph(s.text('on a mta'))),
    );
    expect(underlined(view)).toEqual([]);
    await pause();
    expect(underlined(view)).toEqual(['teh', 'mta']);
    expect(view.dom.querySelector(`.${MISSPELT_CLASS}`)?.getAttribute('data-misspelt')).toBe('teh');
  });

  it('turns the browser’s check off where LiveDoc checks, and leaves it on elsewhere', async () => {
    expect(editorOf(docOf(paragraph(s.text('teh')))).view.dom.getAttribute('spellcheck')).toBe(
      'false',
    );
    const german = editorOf(docOf(paragraph(s.text('teh'))), { language: () => 'de-DE' });
    expect(german.view.dom.getAttribute('spellcheck')).toBe('true');
    await pause();
    expect(underlined(german.view)).toEqual([]);
    expect(german.asked).toEqual([]);
  });

  it('shows nothing, and no browser check either, while misspellings are hidden', async () => {
    const shown = { on: false };
    const { view, asked } = editorOf(docOf(paragraph(s.text('teh'))), { shown: () => shown.on });
    await pause();
    expect(asked).toEqual([]);
    expect(view.dom.getAttribute('spellcheck')).toBe('false');
    shown.on = true;
    rescanSpelling(view);
    await pause();
    expect(underlined(view)).toEqual(['teh']);
  });

  it('leaves the personal dictionary’s words, and the ignored ones, alone', async () => {
    const personal = { d: PersonalDictionary.parse(['livedoc']) };
    const { view } = editorOf(docOf(paragraph(s.text('Livedoc teh mta'))), {
      personal: () => personal.d,
    });
    await pause();
    expect(underlined(view)).toEqual(['teh', 'mta']);
    ignoreMisspelling(view, 'mta');
    expect(underlined(view)).toEqual(['teh']);
    personal.d = PersonalDictionary.parse(['livedoc', 'teh']);
    rescanSpelling(view);
    await pause();
    expect(underlined(view)).toEqual([]);
  });

  it('skips a paragraph the source says is never checked', async () => {
    const { view } = editorOf(docOf(paragraph(s.text('teh')), paragraph(s.text('mta'))), {
      skipped: (block) => block.textContent === 'teh',
    });
    await pause();
    expect(underlined(view)).toEqual(['mta']);
  });

  it('takes an underline away as its word is changed, and reads only the changed paragraph again', async () => {
    const { view, asked } = editorOf(docOf(paragraph(s.text('teh cat')), paragraph(s.text('mta'))));
    await pause();
    asked.length = 0;
    // "teh" -> "tseh", the caret left elsewhere.
    type(view, 2, 's', 1);
    expect(underlined(view)).toEqual(['mta']);
    await pause();
    expect(asked.map((a) => a.words)).toEqual([['tseh', 'cat']]);
    expect(underlined(view)).toEqual(['tseh', 'mta']);
  });

  it('takes an underline away as letters are typed at either end of its word', async () => {
    const { view } = editorOf(docOf(paragraph(s.text('teh mta'))));
    await pause();
    type(view, 4, 's');
    expect(underlined(view)).toEqual(['mta']);
    type(view, 6, 'x');
    expect(underlined(view)).toEqual([]);
  });

  it('underlines the word being typed only once the caret leaves it', async () => {
    const { view } = editorOf(docOf(paragraph(s.text('cat '))));
    await pause();
    type(view, 5, 'mt');
    await pause();
    expect(underlined(view)).toEqual([]);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    await pause();
    expect(underlined(view)).toEqual(['mt']);
  });

  it('places what a read finds on the words it read, though the writing changed meanwhile', async () => {
    const { view, gate, release } = editorOf(docOf(paragraph(s.text('cat teh'))));
    gate.held = true;
    await pause();
    type(view, 1, 'the ', 1);
    gate.held = false;
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(underlined(view)).toEqual(['teh']);
    await pause();
    expect(underlined(view)).toEqual(['teh']);
  });

  it('follows each run’s language: its own check, its own browser check', async () => {
    const italic = s.marks.italic!.create({ value: true });
    const { view } = editorOf(
      docOf(paragraph(s.text('teh '), s.text('der Hnud', [italic]), s.text(' mta'))),
      { runLanguage: (text) => (text.marks.some((m) => m.type.name === 'italic') ? 'de' : null) },
    );
    await pause();
    expect(underlined(view)).toEqual(['teh', 'mta']);
    const german = [...view.dom.querySelectorAll('[spellcheck="true"]')].map(
      (el) => el.textContent,
    );
    expect(german).toEqual(['der Hnud']);
  });

  it('reads the words either side of an object in the line as words of their own', async () => {
    const mark = s.nodes.bookmark!.create();
    const { view } = editorOf(docOf(paragraph(s.text('cat teh'), mark, s.text('mta cat'))));
    await pause();
    expect(underlined(view)).toEqual(['teh', 'mta']);
  });

  it('lets a paragraph go that is deleted before it is read', async () => {
    const { view } = editorOf(docOf(paragraph(s.text('teh')), paragraph(s.text('cat'))));
    await pause();
    type(view, 6, ' mta', 1);
    view.dispatch(view.state.tr.delete(5, view.state.doc.content.size));
    await pause();
    expect(underlined(view)).toEqual(['teh']);
  });

  it('places nothing once the editor is gone', async () => {
    const { view, gate, release } = editorOf(docOf(paragraph(s.text('teh'))));
    gate.held = true;
    await pause();
    const dispatch = vi.spyOn(view, 'dispatch');
    view.destroy();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('tells what each read found', async () => {
    const onFound = vi.fn();
    editorOf(docOf(paragraph(s.text('cat teh'))), { onFound });
    await pause();
    expect(onFound).toHaveBeenCalledWith([{ from: 5, to: 8, word: 'teh', language: 'nl' }]);
  });

  it('says which misspelling a position is in', async () => {
    const { view } = editorOf(docOf(paragraph(s.text('cat teh'))));
    await pause();
    expect(misspellingAt(view.state, 6)).toEqual({
      from: 5,
      to: 8,
      word: 'teh',
      language: 'nl',
    });
    expect(misspellingAt(view.state, 2)).toBeNull();
  });
});
