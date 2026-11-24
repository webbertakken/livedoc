import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/Breadcrumb';
import { helpMetadata } from '@/lib/seo';
import { buttonClassName, CONTACT_FORM_URL, REPORT_A_BUG_PATH, ButtonContent } from '@livedoc/ui';
import { ExternalLinkIcon } from '@/lib/chrome-icons';

export const metadata: Metadata = helpMetadata({
  title: 'Contact',
  description: 'Get in touch with the LiveDoc team or report a bug.',
  path: '/help/contact/',
});

const ExternalIcon = <ExternalLinkIcon />;

export default function ContactPage() {
  return (
    <div>
      <Breadcrumb items={[{ label: 'Contact' }]} />
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="mb-2 text-page-title text-slate-900 dark:text-slate-100">Contact</h1>
        <p className="mb-8 text-panel-title text-slate-600 md:text-name dark:text-slate-300">
          We are happy to help. Pick whichever route fits.
        </p>

        <div className="space-y-4">
          <div className="rounded-surface border border-slate-200 bg-white p-6 transition-all duration-micro hover:border-slate-300 sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600">
            <h2 className="mb-2 text-name text-slate-900 dark:text-slate-100">Message Us</h2>
            <p className="mb-4 text-slate-600 dark:text-slate-300">
              Questions, feedback, or trouble with a feature? Send the team a message through the
              contact form and we will get back to you.
            </p>
            <a
              href={CONTACT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName({ size: 'cta-sm' })}
            >
              <ButtonContent>
                Open the contact form
                {ExternalIcon}
              </ButtonContent>
            </a>
          </div>

          <div className="rounded-surface border border-slate-200 bg-white p-6 transition-all duration-micro hover:border-slate-300 sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600">
            <h2 className="mb-2 text-name text-slate-900 dark:text-slate-100">Report a Bug</h2>
            <p className="mb-4 text-slate-600 dark:text-slate-300">
              Something not working? Tell us what went wrong. Your report goes to the LiveDoc team
              privately, never to a public page, and you can add a screenshot if it helps.
            </p>
            <a
              href={`${REPORT_A_BUG_PATH}?from=/help/contact/`}
              data-bug-report-entry=""
              className={buttonClassName({ variant: 'secondary', size: 'cta-sm' })}
            >
              Report a Bug
            </a>
          </div>

          <div className="rounded-surface border border-slate-200 bg-white p-6 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-name text-slate-900 dark:text-slate-100">Browse the Guides</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Many questions are already answered here. Try the search on the{' '}
              <a
                href="/help/"
                className="text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
              >
                help home
              </a>
              , or browse the{' '}
              <a
                href="/help/features/"
                className="text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
              >
                feature guides
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
