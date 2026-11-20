// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Default styles": a text document made here starts in its
// maker's default styles, so the tabs made here are remembered until they first open.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  noteTextDocumentMade,
  takeTextDocumentMade,
  TEXT_DOCUMENTS_MADE_KEY,
} from './text-document-made';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('the text documents made here', () => {
  it('is true once for a tab made here, then forgets it', () => {
    noteTextDocumentMade('t1');
    noteTextDocumentMade('t2');
    expect(takeTextDocumentMade('t1')).toBe(true);
    expect(takeTextDocumentMade('t1')).toBe(false);
    expect(takeTextDocumentMade('t2')).toBe(true);
    expect(window.sessionStorage.getItem(TEXT_DOCUMENTS_MADE_KEY)).toBeNull();
  });

  it('is false for a tab not made here', () => {
    expect(takeTextDocumentMade('elsewhere')).toBe(false);
  });

  it('keeps the newest twenty', () => {
    for (let i = 0; i < 25; i++) noteTextDocumentMade(`t${i}`);
    expect(takeTextDocumentMade('t4')).toBe(false);
    expect(takeTextDocumentMade('t5')).toBe(true);
    expect(takeTextDocumentMade('t24')).toBe(true);
  });

  it('reads a list it cannot parse as none', () => {
    window.sessionStorage.setItem(TEXT_DOCUMENTS_MADE_KEY, '{nope');
    expect(takeTextDocumentMade('t1')).toBe(false);
    window.sessionStorage.setItem(TEXT_DOCUMENTS_MADE_KEY, '{"t1":1}');
    expect(takeTextDocumentMade('t1')).toBe(false);
  });

  it('logs, and goes on, when this browser keeps no list', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => noteTextDocumentMade('t1')).not.toThrow();
  });
});
