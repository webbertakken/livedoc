'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from './Breadcrumb';
import { SectionedContent } from './SectionedContent';
import { TableOfContents } from './TableOfContents';
import { articleHeadings, type OutlineHeading } from '@/lib/article-outline';
// The hrefs alone, not lib/articles: that would bundle the whole article registry (about 300 articles with their
// descriptions and keywords) into every article's JavaScript.
import { articleHref } from '@livedoc/help-registry/hrefs';
import type { Article } from '@/lib/articles';
import { articleCrumbs, routeHref } from '@/lib/article-route';
import { articleJsonLd } from '@/lib/structured-data';
import { track } from '@/lib/telemetry';
import { helpPathTelemetryId } from '@livedoc/help-registry/telemetry';
import { useArticleVote } from './useArticleVote';
import { CloseIcon, JsonLd, GlyphDisc } from '@livedoc/ui';
import { ClockIcon, ContentsIcon } from '@/lib/chrome-icons';
import { HelpHero } from './HelpHero';
import { ArticlePager, StillNeedHelp } from './ArticlePager';
import type { ArticleLink } from '@/lib/article-neighbours';

/** Sidebar card: shows the TOC and/or a "Learn more" list of related
 *  guides. Renders nothing visible if both are empty (CSS hides it). */
function SidebarCard({
  outline,
  subArticles,
}: {
  outline: OutlineHeading[];
  subArticles?: Article[];
}) {
  const hasSubArticles = !!subArticles && subArticles.length > 0;

  return (
    <div className="sidebar-card rounded-surface border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <TableOfContents items={outline} />
      {hasSubArticles && (
        <>
          <div className="toc-divider my-4 border-t border-slate-200 dark:border-slate-800" />
          <h3 className="mb-1 text-supporting text-slate-500 dark:text-slate-400">Learn More</h3>
          <p className="mb-3 text-supporting text-slate-500 dark:text-slate-400">
            Related guides on this topic
          </p>
          <ul className="space-y-2 pointer-coarse:space-y-0">
            {subArticles.map((a, i) => (
              <li key={a.slug}>
                <Link
                  href={articleHref(a)}
                  className="flex items-center gap-3 py-1 text-body text-slate-600 transition-colors pointer-coarse:min-h-11 hover:text-brand-700 dark:text-slate-300 dark:hover:text-brand-200"
                >
                  <GlyphDisc
                    size={20}
                    className="bg-brand-100 text-supporting text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                  >
                    {i + 1}
                  </GlyphDisc>
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export interface ArticleLayoutProps {
  title: string;
  description?: string;
  categoryTitle: string;
  categorySlug: string;
  subArticles?: Article[];
  parentArticle?: { title: string; slug: string };
  children: React.ReactNode;
}

/** What the server half (ArticleLayout) works out from the registry for the page. */
interface ArticleShellProps extends ArticleLayoutProps {
  /** The article's top-level category, the header's eyebrow link. */
  category?: ArticleLink;
  prev?: ArticleLink;
  next?: ArticleLink;
}

// The client half of an article page (docs/specs/018-help/help-pages.md "Article pages"): the header, the reading
// time, the sidebar and its mobile drawer, the vote and the telemetry. ArticleLayout (the server half, which every
// article's MDX renders) looks the article up in the registry and passes only the links this needs, so the
// registry never ships to the browser.
export function ArticleShell({
  title,
  description,
  categoryTitle,
  subArticles,
  parentArticle,
  category,
  prev,
  next,
  children,
}: ArticleShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [readingTime, setReadingTime] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const text = contentRef.current.textContent ?? '';
      const words = text.split(/\s+/).filter(Boolean).length;
      setReadingTime(Math.max(1, Math.ceil(words / 200)));
    }
  }, []);
  // The article arrives rendered, its headings plain h2 and h3 elements, so its outline is read here, into the
  // static HTML (the reading time is still counted off the page: the article's deeper parts are not resolved here).
  const outline = articleHeadings(children);

  // The current article's telemetry id (docs/specs/017-telemetry/telemetry.md): the registry's unique
  // per-article token for this path, never the free-text title (which the
  // ingest validator would reject). Not the bare last path segment: two
  // articles share one (tips-and-tricks/format-painter beside
  // selection-modes/format-painter), and that merged their numbers. One
  // Help/View event fires per article view.
  const pathname = usePathname();
  const articleId = helpPathTelemetryId(pathname ?? '');
  useEffect(() => {
    if (articleId) track('Help', 'View', articleId);
  }, [articleId]);
  // The helpful vote reports only the reader's final choice (C9).
  const { vote: feedback, cast } = useArticleVote(articleId);

  // This page's URL and its breadcrumb trail, both read off the route (lib/article-route.ts): sub-articles nest
  // under their parent's folder, and the props cannot say where that is (help-pages.md "Article pages").
  const selfHref = routeHref(pathname ?? '');
  const breadcrumbItems = articleCrumbs({
    pathname: pathname ?? '',
    title,
    categoryTitle,
    parentTitle: parentArticle?.title,
  });

  // Article structured data (docs/specs/018-help/help-app.md). The Breadcrumb component already emits
  // the BreadcrumbList, so this only adds the TechArticle node, at this
  // page's own URL (selfHref, above).

  return (
    <div>
      <JsonLd data={articleJsonLd({ title, description: description ?? '', appPath: selfHref })} />
      <Breadcrumb items={breadcrumbItems} />

      <HelpHero
        eyebrow={
          category ? (
            <Link href={category.href} className="hover:underline">
              {category.title}
            </Link>
          ) : undefined
        }
        title={title}
        lede={description}
      >
        {/* The row keeps its height before the time is counted, so nothing below it moves. */}
        <div className="mt-5 flex min-h-icon-title items-center gap-4 text-supporting text-(--hero-muted)">
          {readingTime > 0 && (
            <span className="flex items-center gap-2">
              <ClockIcon className="size-icon-row" />
              {readingTime} min read
            </span>
          )}
        </div>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="relative mt-5 inline-flex items-center gap-2 rounded-menu border touch-target-y border-slate-200 bg-white px-4 py-2 text-body text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ContentsIcon className="size-icon-row" />
          Contents and guides
        </button>
      </HelpHero>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="absolute bottom-0 right-0 top-0 w-80 max-w-[85vw] overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-body text-slate-900 dark:text-slate-100">Article Navigation</h2>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                aria-label="Close navigation"
              >
                <CloseIcon size={20} className="size-icon-title" />
              </button>
            </div>
            <SidebarCard outline={outline} subArticles={subArticles} />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 md:px-6">
        {/* The sidebar's column is a grid track, there before the sidebar is parsed: in a flex row the article took
            the full width until then, and shifted when the sidebar arrived. */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
          <article className="min-w-0">
            <div ref={contentRef}>
              <SectionedContent>{children}</SectionedContent>
            </div>

            <ArticlePager prev={prev} next={next} />

            <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
              <p className="mb-3 text-body text-slate-600 dark:text-slate-300">
                Was this article helpful?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => cast('yes')}
                  className={`cursor-pointer rounded-surface px-6 py-2.5 text-body transition-all duration-micro ${
                    feedback === 'yes'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Yes, it helped
                </button>
                <button
                  onClick={() => cast('no')}
                  className={`cursor-pointer rounded-surface px-6 py-2.5 text-body transition-all duration-micro ${
                    feedback === 'no'
                      ? 'bg-rose-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Not really
                </button>
              </div>
              {feedback && (
                <p className="mt-3 text-body text-slate-500 dark:text-slate-400">
                  Thanks for your feedback.{' '}
                  <a
                    href="/help/contact/"
                    className="text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                  >
                    Need more help?
                  </a>
                </p>
              )}
            </div>

            <StillNeedHelp />
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-[128px] max-h-[calc(100vh-148px)] overflow-y-auto rounded-surface">
              <SidebarCard outline={outline} subArticles={subArticles} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
