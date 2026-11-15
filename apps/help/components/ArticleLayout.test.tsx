// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ArticleLayout } from './ArticleLayout';

vi.mock('next/navigation', () => ({ usePathname: () => '/canvas/shadows/' }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// docs/specs/016-platform/web-performance.md "Layout never shifts after first paint": an article page is in its final
// structure in the static HTML, its Contents included, and the sidebar's column is there before the
// sidebar is.

function render(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <ArticleLayout title="Shadows" categoryTitle="Canvas" categorySlug="canvas" subArticles={[]}>
      <p>An article.</p>
      <h2 id="casting-one">Casting one</h2>
      <h2 id="taking-it-off">Taking it off</h2>
    </ArticleLayout>,
  );
  return host;
}

describe('an article page', () => {
  it('draws the Contents into the static HTML', () => {
    const links = [...render().querySelectorAll('.sidebar-card a[href^="#"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['#casting-one', '#taking-it-off']);
  });

  it('gives the sidebar a grid track of its own, so the article never takes its width first', () => {
    const aside = render().querySelector('.sidebar-card')!.closest('aside')!;
    const row = aside.parentElement!;
    expect(row.className).toMatch(/\blg:grid\b/);
    expect(row.className).toMatch(/\blg:grid-cols-\[minmax\(0,1fr\)_20rem\]/);
  });
});
