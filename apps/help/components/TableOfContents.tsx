import { GlyphDisc } from '@livedoc/ui';
import type { OutlineHeading } from '@/lib/article-outline';

// The article's Contents (docs/specs/018-help/help-pages.md "Article pages"): its outline, worked out from the article
// while it renders (lib/article-outline.ts), so the list is in the static HTML and never moves the sidebar after
// hydration (docs/specs/016-platform/web-performance.md "Layout never shifts after first paint").
export function TableOfContents({ items }: { items: OutlineHeading[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Contents
      </h3>
      <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
        Sections in this article
      </p>
      <ul className="space-y-1.5 pointer-coarse:space-y-0">
        {items.map((item, idx) => {
          const h2Index = items.slice(0, idx + 1).filter((i) => i.level === 2).length;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`flex items-center gap-2.5 py-1 text-sm transition-colors pointer-coarse:min-h-11 hover:text-brand-700 dark:hover:text-brand-200 ${
                  item.level === 3
                    ? 'pl-7 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.level === 2 && (
                  <GlyphDisc
                    size={20}
                    className="mr-2 bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                  >
                    {h2Index}
                  </GlyphDisc>
                )}
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
