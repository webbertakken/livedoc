// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OutlineHeading } from '@/lib/article-outline';
import { TableOfContents } from './TableOfContents';

// The contents list is the article's outline (lib/article-outline.ts), drawn into the static HTML with the anchors
// its headings carry (docs/specs/016-platform/web-performance.md "Layout never shifts after first paint").

const items: OutlineHeading[] = [
  { id: 'first-part', text: 'First part', level: 2 },
  { id: 'a-detail', text: 'A detail', level: 3 },
  { id: 'second-part', text: 'Second part', level: 2 },
];

function render(list: OutlineHeading[]): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<TableOfContents items={list} />);
  return host;
}

describe('TableOfContents', () => {
  it('links every heading of the outline, in the static markup', () => {
    const links = [...render(items).querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['#first-part', '#a-detail', '#second-part']);
  });

  it('numbers the sections and indents the sub-sections', () => {
    const rows = [...render(items).querySelectorAll('a')];
    expect(rows.map((a) => a.textContent)).toEqual(['1First part', 'A detail', '2Second part']);
    expect(rows[1]!.className).toMatch(/\bpl-7\b/);
  });

  it('shows nothing for an article without an outline', () => {
    expect(render([]).innerHTML).toBe('');
  });
});

// docs/specs/004-interface-design/touch-targets.md "A list's rows abut at 44px".
describe('TableOfContents on a touch screen', () => {
  it('stacks 44px rows with no gap between them', () => {
    const host = render(items);
    expect(host.querySelector('ul')!.className).toMatch(/\bpointer-coarse:space-y-0\b/);
    for (const a of host.querySelectorAll('a'))
      expect(a.className).toMatch(/\bpointer-coarse:min-h-11\b/);
  });
});
