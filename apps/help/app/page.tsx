import type { Metadata } from 'next';
import Link from 'next/link';
import {
  buttonClassName,
  ButtonContent,
  CONTACT_FORM_URL,
  GlyphDisc,
  REPORT_A_BUG_PATH,
} from '@livedoc/ui';
import { SearchInput } from '@/components/SearchInput';
import { CategoryCard, guideCount } from '@/components/CategoryCard';
import { CategoryArt } from '@/components/category-art';
import { Breadcrumb } from '@/components/Breadcrumb';
import { HelpHero } from '@/components/HelpHero';
import {
  articleHref,
  articles,
  categories,
  categoryHref,
  getArticlesByCategory,
  type Category,
} from '@/lib/articles';
import { HOME_SECTIONS, POPULAR_TOPICS, START_HERE, STILL_STUCK } from '@/lib/home-sections';
import { helpMetadata } from '@/lib/seo';
import { ArrowRightIcon, MessageIcon } from '@/lib/chrome-icons';

// The one page that spells out the " | LiveDoc" suffix: the root layout's title template only reaches child
// segments, not this root index.
export const metadata: Metadata = helpMetadata({
  title: 'Help | LiveDoc',
  description:
    'Guides, tutorials, and answers for LiveDoc. Browse feature documentation, getting-started guides, and troubleshooting.',
  path: '/help/',
});

function category(slug: string): Category {
  const found = categories.find((c) => c.slug === slug);
  if (!found) throw new Error(`[help-home] unknown category: ${slug}`);
  return found;
}

function articleAt(path: string) {
  const found = articles.find((a) => `${a.categorySlug}/${a.slug}` === path);
  if (!found) throw new Error(`[help-home] unknown article: ${path}`);
  return found;
}

// A section's opening: eyebrow, heading and lede.
function SectionHead({
  eyebrow,
  heading,
  lede,
}: {
  eyebrow: string;
  heading: string;
  lede: string;
}) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-2 text-supporting text-brand-700 dark:text-brand-300">{eyebrow}</p>
      <h2 className="text-page-title text-slate-900 dark:text-slate-50">{heading}</h2>
      <p className="mt-2 text-panel-title text-slate-500 dark:text-slate-400">{lede}</p>
    </div>
  );
}

export default function HelpHome() {
  const walkthrough = category(START_HERE.walkthrough);
  const walkthroughArticles = getArticlesByCategory(walkthrough.slug);
  const steps = walkthroughArticles.slice(0, START_HERE.steps);
  const troubleshooting = category(STILL_STUCK.category);
  return (
    <div>
      <Breadcrumb items={[]} />
      <HelpHero
        home
        title="How can we help?"
        lede="Guides and answers for every part of LiveDoc, from your first diagram onwards."
      >
        <div className="mx-auto mt-5 flex flex-wrap justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-(--hero-chip-border) bg-(--hero-chip-bg) px-3 py-1 text-supporting text-(--hero-chip-text)">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            {`${articles.length} guides`}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-(--hero-chip-border) bg-(--hero-chip-bg) px-3 py-1 text-supporting text-(--hero-chip-text)">
            <span aria-hidden className="size-1.5 rounded-full bg-brand-500" />
            Search them from inside the editor too
          </span>
        </div>
        <div className="mx-auto mt-8 max-w-2xl">
          <SearchInput large />
        </div>
        <nav
          aria-label="Popular topics"
          className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2"
        >
          <span className="text-body text-(--hero-muted)">Popular:</span>
          {POPULAR_TOPICS.map((t) => (
            <Link
              key={t.path}
              href={articleHref(articleAt(t.path))}
              className="relative rounded-full border border-(--hero-chip-border) bg-(--hero-chip-bg) px-3 py-1 text-body text-(--hero-chip-text) transition-colors touch-target-y hover:border-(--hero-chip-border-hover)"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </HelpHero>

      {/* Start here. */}
      <section aria-labelledby="start-here" className="mx-auto max-w-7xl px-4 pt-14 md:px-6">
        <div className="card-glow overflow-hidden rounded-surface bg-white dark:bg-slate-900">
          <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div
              aria-hidden
              className="aspect-[400/220] overflow-hidden border-b border-slate-100 md:aspect-auto md:border-b-0 md:border-r dark:border-slate-800"
            >
              <CategoryArt slug={walkthrough.slug} />
            </div>
            <div className="p-6 md:p-6">
              <p className="mb-1 text-supporting text-brand-700 dark:text-brand-300">Start Here</p>
              <h2 id="start-here" className="text-dialog-title text-slate-900 dark:text-slate-50">
                New to LiveDoc?
              </h2>
              <ol className="mt-4 space-y-1">
                {steps.map((a, i) => (
                  <li key={a.slug}>
                    <Link
                      href={articleHref(a)}
                      className="group/step -mx-2 flex items-center gap-3 rounded-menu px-2 py-1.5 text-body text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-800 dark:text-slate-200 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                    >
                      <GlyphDisc size={24} className="bg-brand-700 text-supporting text-white">
                        {i + 1}
                      </GlyphDisc>
                      <span className="font-medium">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <Link
                href={categoryHref(walkthrough.slug)}
                className="mt-4 inline-flex items-center gap-2 text-body text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
              >
                {`All ${walkthroughArticles.length} getting started guides`}
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {START_HERE.beside.map((slug) => (
            <CategoryCard key={slug} category={category(slug)} wide />
          ))}
        </div>
      </section>

      {HOME_SECTIONS.map((s) => {
        const wide = s.categories.length === 2;
        return (
          <section
            key={s.id}
            id={s.id}
            className="mx-auto max-w-7xl scroll-mt-32 px-4 pt-16 md:px-6"
          >
            <SectionHead eyebrow={s.eyebrow} heading={s.heading} lede={s.lede} />
            <div
              className={`grid grid-cols-1 gap-4 ${
                wide
                  ? 'lg:grid-cols-2'
                  : s.categories.length === 4
                    ? 'sm:grid-cols-2 lg:grid-cols-4'
                    : 'sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {s.categories.map((slug) => (
                <CategoryCard key={slug} category={category(slug)} wide={wide} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Still stuck? */}
      <section aria-labelledby="still-stuck" className="mx-auto max-w-7xl px-4 pt-16 md:px-6">
        <div className="relative overflow-hidden rounded-surface bg-slate-900 p-6 text-white md:p-6 dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] bg-size-[18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
          />
          <div className="relative grid items-center gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-supporting text-brand-300">Still Stuck?</p>
              <h2 id="still-stuck" className="text-page-title">
                We&apos;ll help you get going again
              </h2>
              <p className="mt-3 max-w-md text-slate-300">
                Most problems have a quick fix in Troubleshooting. If yours doesn&apos;t, tell us
                and we will look into it.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={CONTACT_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClassName({ size: 'cta-sm' })}
                >
                  <ButtonContent>
                    <MessageIcon />
                    Contact us
                  </ButtonContent>
                </a>
                {/* Report a Bug (docs/specs/004-interface-design/report-a-bug-entries.md): private, never a public issue. */}
                <a
                  href={`${REPORT_A_BUG_PATH}?from=/help/`}
                  data-bug-report-entry=""
                  className="inline-flex items-center gap-2 rounded-menu border border-slate-600 px-4 py-2 text-body text-slate-100 transition-colors hover:border-slate-400 hover:bg-white/5"
                >
                  Report a Bug
                </a>
              </div>
            </div>
            <Link
              href={categoryHref(troubleshooting.slug)}
              className="group flex flex-col overflow-hidden rounded-surface bg-white text-slate-900 ring-1 ring-white/10 transition-shadow hover:ring-brand-300 sm:flex-row dark:bg-slate-950 dark:text-slate-100"
            >
              <div aria-hidden className="aspect-[400/220] overflow-hidden sm:aspect-auto sm:w-1/2">
                <CategoryArt slug={troubleshooting.slug} />
              </div>
              <div className="flex flex-1 flex-col justify-center p-6">
                <h3 className="group-hover:text-brand-700 dark:group-hover:text-brand-200">
                  {troubleshooting.title}
                </h3>
                <p className="mt-1 text-body text-slate-500 dark:text-slate-400">
                  {troubleshooting.description}
                </p>
                <span className="mt-3 inline-flex items-center gap-2 text-body text-brand-700 dark:text-brand-300">
                  {`Browse ${guideCount(troubleshooting.articleCount)}`}
                  <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
