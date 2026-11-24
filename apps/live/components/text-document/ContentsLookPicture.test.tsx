// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents": Insert's looks and the panel's choice each
// show a small picture of the look: entries with their page numbers at the right (Plain text), dots leading to them
// (Dotted), or blue entries without them (With blue links); hidden from screen readers, the name saying it.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ContentsLookPicture } from './ContentsLookPicture';

const parts = (look: 'plain' | 'dotted' | 'links') => {
  const { container } = render(<ContentsLookPicture look={look} />);
  const svg = container.querySelector('svg')!;
  const count = (part: string) => svg.querySelectorAll(`[data-part="${part}"]`).length;
  return {
    hidden: svg.getAttribute('aria-hidden'),
    entries: count('entry'),
    numbers: count('number'),
    leaders: count('leader'),
    blue: [...svg.querySelectorAll('[data-part="entry"]')].every((e) =>
      e.getAttribute('class')?.includes('contents-look-link'),
    ),
  };
};

describe('ContentsLookPicture', () => {
  it('draws Plain text as entries with page numbers, no leaders', () => {
    expect(parts('plain')).toEqual({
      hidden: 'true',
      entries: 3,
      numbers: 3,
      leaders: 0,
      blue: false,
    });
  });

  it('draws Dotted with dots leading to the page numbers', () => {
    expect(parts('dotted')).toEqual({
      hidden: 'true',
      entries: 3,
      numbers: 3,
      leaders: 3,
      blue: false,
    });
  });

  it('draws With blue links as blue entries without page numbers', () => {
    expect(parts('links')).toEqual({
      hidden: 'true',
      entries: 3,
      numbers: 0,
      leaders: 0,
      blue: true,
    });
  });
});
