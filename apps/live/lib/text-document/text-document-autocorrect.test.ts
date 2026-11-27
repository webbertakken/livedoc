// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PersonalDictionary } from '@/lib/spelling/personal-dictionary';
import type { SpellingChecker } from '@/lib/spelling/spelling-checker';
import { textDocumentSchema } from './text-document-schema';
import { autocorrectPlugin } from './text-document-autocorrect';
import { ignoreMisspelling, spellingPlugin, type SpellingSource } from './text-document-spelling';

// docs/specs/034-text-documents/tools.md "Spelling and grammar": Automatically correct spelling.

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const s = textDocumentSchema;
const docOf = (...texts: string[]) =>
  s.node(
    'doc',
    null,
    texts.map((t) => s.node('paragraph', null, t ? [s.text(t)] : [])),
  );

// Answers "teh" with "the" once `release` is called (at once unless held).
function fakeChecker() {
  const gate = { held: false, waiting: [] as (() => void)[] };
  const asked: string[] = [];
  const checker: SpellingChecker = {
    check: (_, words) => Promise.resolve(new Set(words.filter((w) => w === 'teh'))),
    known: (_, word) => (word === 'sat' ? true : undefined),
    suggest: () => Promise.resolve([]),
    correct: async (_, word) => {
      asked.push(word);
      if (gate.held) await new Promise<void>((r) => gate.waiting.push(r));
      return word.toLowerCase() === 'teh' ? (word === 'Teh' ? 'The' : 'the') : null;
    },
  };
  return { checker, gate, asked, release: () => gate.waiting.splice(0).forEach((r) => r()) };
}

const views: EditorView[] = [];
function editorOf(doc: PmNode, over: Partial<SpellingSource> = {}, enabled = () => true) {
  const fake = fakeChecker();
  const source: SpellingSource = {
    checker: fake.checker,
    language: () => 'nl',
    personal: () => PersonalDictionary.empty(),
    shown: () => true,
    ...over,
  };
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      plugins: [autocorrectPlugin({ source, enabled }), spellingPlugin(source)],
      selection: TextSelection.atEnd(doc),
    }),
  });
  views.push(view);
  return { view, ...fake };
}

// What the editor does with a typed character: its handlers first, then the insertion when none took it.
function type(view: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const taken = view.someProp('handleTextInput', (f) =>
      f(view, from, to, ch, () => view.state.tr),
    );
    if (!taken) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  views.splice(0).forEach((v) => v.destroy());
  track.mockClear();
});

describe('autocorrectPlugin', () => {
  it('corrects a word it is sure of as the word ends, keeping its first letter’s case', async () => {
    const { view } = editorOf(docOf('Teh cat'));
    type(view, ' sat teh.');
    await settle();
    expect(view.state.doc.textContent).toBe('Teh cat sat the.');
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentSpellingCorrected');
    const second = editorOf(docOf(''));
    type(second.view, 'Teh ');
    await settle();
    expect(second.view.state.doc.textContent).toBe('The ');
  });

  it('corrects as Enter ends the word', async () => {
    const { view } = editorOf(docOf('a teh'));
    view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'Enter' })));
    await settle();
    expect(view.state.doc.textContent).toBe('a the');
  });

  it('lands on the word where it now is, though the writing changed meanwhile', async () => {
    const { view, gate, release } = editorOf(docOf('teh'));
    gate.held = true;
    type(view, ' cat');
    view.dispatch(view.state.tr.insertText('A ', 1));
    gate.held = false;
    release();
    await settle();
    expect(view.state.doc.textContent).toBe('A the cat');
  });

  it('leaves a word changed before the answer came', async () => {
    const { view, gate, release } = editorOf(docOf('teh'));
    gate.held = true;
    type(view, ' ');
    view.dispatch(view.state.tr.insertText('x', 3));
    release();
    await settle();
    expect(view.state.doc.textContent).toBe('texh ');
  });

  it('does nothing while it is off, while misspellings are hidden, or for a word not checked', async () => {
    const off = editorOf(docOf('teh'), {}, () => false);
    type(off.view, ' ');
    const hidden = editorOf(docOf('teh'), { shown: () => false });
    type(hidden.view, ' ');
    const german = editorOf(docOf('teh'), { language: () => 'de' });
    type(german.view, ' ');
    const code = editorOf(docOf('teh'), { skipped: () => true });
    type(code.view, ' ');
    const number = editorOf(docOf('teh2'));
    type(number.view, ' ');
    // Mid-word: no word ends.
    const mid = editorOf(docOf('teh'));
    type(mid.view, 'x');
    await settle();
    for (const { view, asked } of [off, hidden, german, code, number, mid]) {
      expect(asked).toEqual([]);
      expect(view.state.doc.textContent).not.toContain('the');
    }
  });

  it('leaves personal and ignored words alone', async () => {
    const personal = editorOf(docOf('teh'), { personal: () => PersonalDictionary.parse(['teh']) });
    type(personal.view, ' ');
    const ignored = editorOf(docOf('teh'));
    ignoreMisspelling(ignored.view, 'teh');
    type(ignored.view, ' ');
    await settle();
    expect(personal.view.state.doc.textContent).toBe('teh ');
    expect(ignored.view.state.doc.textContent).toBe('teh ');
  });

  it('asks nothing about a word known to be right', async () => {
    const { view, asked } = editorOf(docOf('sat'));
    type(view, ' ');
    await settle();
    expect(asked).toEqual([]);
  });

  it('lets a word with no sure correction be', async () => {
    const { view, asked } = editorOf(docOf('cat'));
    type(view, ' ');
    await settle();
    expect(asked).toEqual(['cat']);
    expect(view.state.doc.textContent).toBe('cat ');
  });

  it('places nothing once the editor is gone', async () => {
    const { view, gate, release } = editorOf(docOf('teh'));
    gate.held = true;
    type(view, ' ');
    const dispatch = vi.spyOn(view, 'dispatch');
    view.destroy();
    release();
    await settle();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
