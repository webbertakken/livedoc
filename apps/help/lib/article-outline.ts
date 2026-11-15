import { Children, isValidElement, type ReactNode } from 'react';
import { slugOf, textOf } from '@/lib/heading-id';

// An article's outline, read from the article itself while it renders (docs/specs/016-platform/web-performance.md
// "Layout never shifts after first paint"): its Contents are in the static HTML, never read off the DOM after
// hydration. The article reaches the page's client half already rendered, so its sections are plain
// `h2` and `h3` elements (mdx-components.tsx gives each the id its Contents link uses).

export interface OutlineHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const NO_HEADINGS: OutlineHeading[] = [];

function collectHeadings(node: ReactNode, into: OutlineHeading[]): void {
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode; id?: string }>(child)) return;
    if (child.type === 'h2' || child.type === 'h3') {
      const text = textOf(child.props.children).trim();
      if (text)
        into.push({ id: child.props.id || slugOf(text), text, level: child.type === 'h2' ? 2 : 3 });
      return;
    }
    collectHeadings(child.props.children, into);
  });
}

/** The article's sections and sub-sections, in order; none for an article of one heading or fewer. */
export function articleHeadings(article: ReactNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  collectHeadings(article, headings);
  return headings.length > 1 ? headings : NO_HEADINGS;
}
