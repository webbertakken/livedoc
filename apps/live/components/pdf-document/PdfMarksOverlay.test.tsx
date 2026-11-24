// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The recolouring": a mark made in LiveDoc passes through the same step as
// the file's own, so under Dark pages it takes the step's colour and lightens the dark page rather than multiplying.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DarkPages, Mark, PageName, type Quad } from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import { PdfMarksOverlay } from './PdfMarksOverlay';

const QUAD: Quad = [10, 20, 50, 20, 10, 10, 50, 10];
const mark = Mark.highlight({
  id: 'm1',
  page: PageName.ofObject(1),
  quads: [QUAD],
  text: 'words',
  colour: '#ffeb3b',
  opacity: 1,
  author: 'Ada',
  createdAt: 0,
})!;

function overlay(look: 'paper' | 'dark') {
  const { container } = render(
    <PdfLookContext.Provider value={look}>
      <PdfMarksOverlay matrix={[1, 0, 0, -1, 0, 100]} width={100} height={100} marks={[mark]} />
    </PdfLookContext.Provider>,
  );
  return container.querySelector('svg')!;
}

describe('LiveDoc’s marks over a page', () => {
  it('multiplies a mark in its own colour onto paper', () => {
    const svg = overlay('paper');
    expect(svg.getAttribute('class')).toContain('mix-blend-multiply');
    expect(svg.querySelector('[data-pdf-mark="m1"]')!.getAttribute('fill')).toBe('#ffeb3b');
  });

  it('lightens a Dark page with the colour the step gives the file’s own marks', () => {
    const svg = overlay('dark');
    expect(svg.getAttribute('data-pdf-look')).toBe('dark');
    expect(svg.getAttribute('class')).toContain('mix-blend-lighten');
    expect(svg.querySelector('[data-pdf-mark="m1"]')!.getAttribute('fill')).toBe(
      DarkPages.hex('#ffeb3b'),
    );
  });
});
