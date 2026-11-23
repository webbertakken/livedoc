// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HighlightedTitle, TitleHighlightProvider } from './TitleHighlight';

afterEach(cleanup);

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('mark')].map((mark) => mark.textContent);

describe('HighlightedTitle', () => {
  it('renders the plain name outside a provider', () => {
    const { container } = render(<HighlightedTitle name="Meeting notes" />);
    expect(container.innerHTML).toBe('Meeting notes');
  });

  it('renders the plain name when the lens has no text', () => {
    const { container } = render(
      <TitleHighlightProvider text={[]}>
        <HighlightedTitle name="Meeting notes" />
      </TitleHighlightProvider>,
    );
    expect(container.innerHTML).toBe('Meeting notes');
  });

  it('renders the plain name when nothing in it matches', () => {
    const { container } = render(
      <TitleHighlightProvider text={['zebra']}>
        <HighlightedTitle name="Meeting notes" />
      </TitleHighlightProvider>,
    );
    expect(container.innerHTML).toBe('Meeting notes');
  });

  it('marks the matched characters, accents and all', () => {
    const { container } = render(
      <TitleHighlightProvider text={['mtg', 'cafe']}>
        <HighlightedTitle name="Meeting at the Café" />
      </TitleHighlightProvider>,
    );
    expect(marks(container)).toEqual(['M', 't', 'g', 'Café']);
  });

  it('gives a screen reader the plain name once and hides the marked copy', () => {
    const { container } = render(
      <TitleHighlightProvider text={['notes']}>
        <HighlightedTitle name="Meeting notes" />
      </TitleHighlightProvider>,
    );
    const [plain, marked] = [...container.children] as HTMLElement[];
    expect(plain!.className).toContain('sr-only');
    expect(plain!.textContent).toBe('Meeting notes');
    expect(marked!.getAttribute('aria-hidden')).toBe('true');
    expect(marked!.textContent).toBe('Meeting notes');
  });

  it('marks a match by underline and weight, not by colour alone', () => {
    const { container } = render(
      <TitleHighlightProvider text={['notes']}>
        <HighlightedTitle name="Meeting notes" />
      </TitleHighlightProvider>,
    );
    const mark = container.querySelector('mark')!;
    expect(mark.className).toContain('underline');
    expect(mark.className).toContain('font-medium');
  });
});
