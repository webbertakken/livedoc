import type { LicencesManifest, LicencesSection, WorkEntry } from '@livedoc/licences';

import { LicenceTexts } from './LicenceTexts';

// The /licences page body (docs/specs/002-project-scope/third-party-licences.md
// "The page"): server-rendered sections of collapsed entries; only the texts
// are client-side, and they load when an entry opens.

const SECTION_COPY: Record<LicencesSection['side'], { title: string; lead: string }> = {
  browser: { title: 'In your browser', lead: 'Sent to your browser by these apps' },
  server: {
    title: 'On our servers',
    lead: 'Bundled into these services, which run on Cloudflare rather than on your device',
  },
};

// A section's intro names its apps from the manifest, the list the page is built from, so an app added to
// LICENCE_APPS is named without a copy edit: "…: Editor, Website, Help centre and Telemetry."
export function sectionIntro(side: LicencesSection['side'], labels: readonly string[]): string {
  const apps =
    labels.length < 2
      ? (labels[0] ?? '')
      : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  return `${SECTION_COPY[side].lead}: ${apps}.`;
}

// The project LiveDoc was forked from (docs/specs/002-project-scope/livediagram-upstream.md).
const UPSTREAM_REPO_URL = 'https://github.com/livediagram-app/livediagram.app';

export function LicencesView({ manifest }: { manifest: LicencesManifest }) {
  return (
    <>
      <h1 className="text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
        Open-source licences
      </h1>
      <p className="mt-3 text-name text-slate-600 dark:text-slate-300">
        LiveDoc is MIT licensed and built on the work of many open-source projects. These are the
        ones our apps ship, generated from what each app actually bundles every time the site is
        built.
      </p>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        LiveDoc began as a fork of{' '}
        <a
          href={UPSTREAM_REPO_URL}
          className="text-brand-700 underline hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          livediagram
        </a>
        , which is MIT licensed too. Its copyright notice is kept in the repository&rsquo;s licence.
      </p>
      {manifest.sections.map((section) => (
        <Section key={section.side} section={section} manifest={manifest} />
      ))}
    </>
  );
}

function Section({ section, manifest }: { section: LicencesSection; manifest: LicencesManifest }) {
  const copy = SECTION_COPY[section.side];
  const labels = new Map(section.apps.map((app) => [app.id, app.label]));
  const count = section.works.length;
  return (
    <section aria-labelledby={`${section.side}-heading`} className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id={`${section.side}-heading`}
          className="text-dialog-title text-slate-900 dark:text-slate-100"
        >
          {copy.title}
        </h2>
        <p className="text-body text-slate-600 dark:text-slate-300">
          {count} {count === 1 ? 'work' : 'works'}
        </p>
      </div>
      <p className="mt-1 text-body text-slate-600 dark:text-slate-300">
        {sectionIntro(
          section.side,
          section.apps.map((app) => app.label),
        )}
      </p>
      {count === 0 ? (
        <p className="mt-4 text-body text-slate-600 dark:text-slate-300">
          Nothing third-party ships here.
        </p>
      ) : (
        <ul className="lic-list">
          {section.works.map((work) => (
            <li key={work.anchor}>
              <Entry work={work} labels={labels} manifest={manifest} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Entry({
  work,
  labels,
  manifest,
}: {
  work: WorkEntry;
  labels: Map<string, string>;
  manifest: LicencesManifest;
}) {
  return (
    <details id={work.anchor} className="lic-entry">
      <summary className="lic-summary">
        <h3 className="lic-name">{work.name}</h3>
        <span className="lic-meta">{work.version}</span>
        <span className="lic-tags">
          <code className="lic-id">{work.licence}</code>
          <span className="sr-only">{'Ships in '}</span>
          {work.apps.map((app, i) => (
            <span key={app} className="lic-chip">
              {labels.get(app) ?? app}
              {i < work.apps.length - 1 ? <span className="sr-only">,</span> : null}
            </span>
          ))}
        </span>
      </summary>
      <div className="lic-body">
        {work.carrier ? <p>Inside {work.carrier}.</p> : null}
        {work.homepage ? (
          <p>
            <a
              href={work.homepage}
              aria-label={`Source of ${work.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lic-link"
            >
              Source
            </a>
          </p>
        ) : null}
        <LicenceTexts
          work={work.name}
          texts={work.texts.map((t) => ({ ...t, lines: manifest.texts[t.hash]?.lines ?? 1 }))}
        />
      </div>
    </details>
  );
}
