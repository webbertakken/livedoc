import { describe, expect, it } from 'vitest';
import { PageTags, type TagElement, type TagKid } from './page-tags';
import { PageText } from './page-text';

// accessibility.md "The accessible tree": the file's tags where they cover the page, else geometry.

const { UNMARKED: U, ARTIFACT: A } = PageText;

/** A page of one-letter characters on one line, each 10 wide; a space is the reader's own, with no box. */
function pageOf(text: string, marked: readonly number[] | null): PageText {
  const boxes: number[] = [];
  [...text].forEach((unit, at) =>
    boxes.push(...(unit === ' ' ? [0, 0, 0, 0] : [at * 10, 700, at * 10 + 8, 712])),
  );
  return PageText.of(
    [...text].map((unit) => unit.codePointAt(0)!),
    boxes,
    { marked },
  );
}

const el = (type: string, kids: readonly TagKid[], more: Partial<TagElement> = {}): TagElement => ({
  type,
  alt: '',
  actual: '',
  lang: '',
  kids,
  ...more,
});

describe('PageTags.read', () => {
  it('reads the tags in their own order, each marked content as its text', () => {
    const page = pageOf('Body Title', [1, 1, 1, 1, U, 0, 0, 0, 0, 0]);
    const tags = { elements: [el('H1', [0]), el('P', [1])], cut: false };

    expect(PageTags.read(tags, page)).toEqual({
      source: 'tags',
      count: 4,
      nodes: [
        { type: 'H1', alt: '', lang: '', kids: ['Title'] },
        { type: 'P', alt: '', lang: '', kids: ['Body'] },
      ],
    });
  });

  it('joins a marked content split by the reader’s own characters, and reads each break as a space', () => {
    const page = PageText.of(
      [...'ab\r\ncd'].map((unit) => unit.codePointAt(0)!),
      [0, 700, 8, 712, 10, 700, 18, 712, 0, 0, 0, 0, 0, 0, 0, 0, 0, 680, 8, 692, 10, 680, 18, 692],
      { marked: [4, 4, U, U, 4, 4] },
    );
    const read = PageTags.read({ elements: [el('P', [4])], cut: false }, page);

    expect(read).toMatchObject({ source: 'tags', nodes: [{ kids: ['ab cd'] }] });
  });

  it('reads a marked content drawn in two places as both, with nothing between', () => {
    const page = pageOf('abXcd', [2, 2, 3, 2, 2]);
    const read = PageTags.read({ elements: [el('P', [2]), el('Span', [3])], cut: false }, page);

    expect(read).toMatchObject({ nodes: [{ kids: ['ab cd'] }, { kids: ['X'] }] });
  });

  it('reads replacement text in place of the content, and keeps alternative text and language', () => {
    const page = pageOf('xy', [0, 1]);
    const tags = {
      elements: [
        el('Span', [0], { actual: 'replaced', lang: 'nl' }),
        el('Figure', [1], { alt: 'A red square' }),
      ],
      cut: false,
    };

    expect(PageTags.read(tags, page)).toMatchObject({
      nodes: [
        { type: 'Span', lang: 'nl', kids: ['replaced'] },
        { type: 'Figure', alt: 'A red square', kids: ['y'] },
      ],
    });
  });

  it('nests elements and leaves out content with no text', () => {
    const page = pageOf('a', [1]);
    const tags = {
      elements: [el('L', [el('LI', [el('Lbl', [1]), el('LBody', [9])])])],
      cut: false,
    };

    expect(PageTags.read(tags, page)).toEqual({
      source: 'tags',
      count: 5,
      nodes: [
        {
          type: 'L',
          alt: '',
          lang: '',
          kids: [
            {
              type: 'LI',
              alt: '',
              lang: '',
              kids: [
                { type: 'Lbl', alt: '', lang: '', kids: ['a'] },
                { type: 'LBody', alt: '', lang: '', kids: [] },
              ],
            },
          ],
        },
      ],
    });
  });

  it('covers a page whose artifacts no tag reaches', () => {
    const page = pageOf('a 1', [0, U, A]);

    expect(PageTags.read({ elements: [el('P', [0])], cut: false }, page).source).toBe('tags');
  });

  it('reads tags on a page with no text', () => {
    const tags = { elements: [el('Figure', [0], { alt: 'Black' })], cut: false };

    expect(PageTags.read(tags, null)).toMatchObject({ source: 'tags', count: 1 });
    expect(PageTags.read(tags, pageOf('', [])).source).toBe('tags');
  });

  it('reads from geometry where a drawn character sits in no tagged content', () => {
    const page = pageOf('ab', [0, U]);

    expect(PageTags.read({ elements: [el('P', [0])], cut: false }, page)).toEqual({
      source: 'geometry',
      why: 'partial',
    });
  });

  it('reads from geometry where marked content is drawn that no tag reaches', () => {
    const page = pageOf('ab', [0, 7]);

    expect(PageTags.read({ elements: [el('P', [0])], cut: false }, page)).toMatchObject({
      why: 'partial',
    });
  });

  it('reads from geometry where the page has no tags, the file is untagged, or the tags were cut', () => {
    const page = pageOf('a', [0]);

    expect(PageTags.read(null, page)).toEqual({ source: 'geometry', why: 'absent' });
    expect(PageTags.read({ elements: [], cut: false }, page)).toMatchObject({ why: 'absent' });
    expect(
      PageTags.read({ elements: [el('P', [0])], cut: false }, pageOf('a', null)),
    ).toMatchObject({ why: 'absent' });
    expect(PageTags.read({ elements: [el('P', [0])], cut: true }, page)).toMatchObject({
      why: 'cut',
    });
  });
});
