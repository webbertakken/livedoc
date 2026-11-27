// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NO_WORDS,
  PERSONAL_WORD_INVALID,
  PERSONAL_WORD_PRESENT,
  TextDocumentPersonalDictionaryDialog,
} from './TextDocumentPersonalDictionaryDialog';
import { DICTIONARY_FULL } from '@/lib/spelling/personal-dictionary';

// docs/specs/034-text-documents/tools.md "Spelling and grammar": the Personal dictionary dialog.

const field = () => screen.getByRole('textbox', { name: 'Word' });
const type = (text: string) =>
  act(() => {
    fireEvent.change(field(), { target: { value: text } });
  });

describe('TextDocumentPersonalDictionaryDialog', () => {
  it('lists the words in alphabetical order, whatever their case', () => {
    render(
      <TextDocumentPersonalDictionaryDialog
        words={['zebra', 'Livedoc', 'apple']}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'apple',
      'Livedoc',
      'zebra',
    ]);
  });

  it('says so with no words', () => {
    render(
      <TextDocumentPersonalDictionaryDialog
        words={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(NO_WORDS)).toBeTruthy();
  });

  it('adds the word typed, with Add or Enter, and empties the field', () => {
    const onAdd = vi.fn(() => null);
    render(
      <TextDocumentPersonalDictionaryDialog
        words={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Add$/ })).toHaveProperty('disabled', true);
    type(' Livedoc ');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    });
    expect(onAdd).toHaveBeenCalledWith('Livedoc');
    expect(field()).toHaveProperty('value', '');
    type('nspell');
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    expect(onAdd).toHaveBeenLastCalledWith('nspell');
  });

  it.each([
    ['invalid', PERSONAL_WORD_INVALID],
    ['present', PERSONAL_WORD_PRESENT],
    ['full', DICTIONARY_FULL],
  ] as const)('says why a word is refused: %s', (refusal, copy) => {
    render(
      <TextDocumentPersonalDictionaryDialog
        words={[]}
        onAdd={() => refusal}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    type('two words');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    });
    expect(screen.getByRole('alert').textContent).toBe(copy);
    expect(field()).toHaveProperty('value', 'two words');
    type('two');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes a word', () => {
    const onRemove = vi.fn();
    render(
      <TextDocumentPersonalDictionaryDialog
        words={['apple']}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onClose={vi.fn()}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove apple' }));
    });
    expect(onRemove).toHaveBeenCalledWith('apple');
  });
});
