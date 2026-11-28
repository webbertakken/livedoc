// The Work section (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text documents"): a
// project proposal, the project brief Pages's article template was (fork D4), a brochure, meeting notes and a
// newsletter. Pure data.
import { bold, italic, run, templateDocument } from './template-writing';
import type { TextDocumentTemplate } from './template-types';

const BLUE = '#1a56b8';
const GREEN = '#2e7d32';
const ORANGE = '#b45309';
const GREY = '#595959';
const PALE_BLUE = '#e8f0fe';
const PALE_GREEN = '#e8f5e9';

export const PROJECT_PROPOSAL: TextDocumentTemplate = {
  id: 'text-project-proposal',
  name: 'Project proposal',
  section: 'work',
  build: () =>
    templateDocument(
      {
        text: { font: 'Arial', size: 11, color: '#202124' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 8 },
        styles: {
          title: { text: { size: 30, bold: true, color: BLUE }, paragraph: { spaceAfter: 2 } },
          subtitle: { text: { size: 14, color: GREY }, paragraph: { spaceAfter: 18 } },
          heading1: { text: { size: 15, bold: true, color: BLUE }, paragraph: { spaceBefore: 18 } },
        },
      },
      (w) => [
        w.title('Community Library App'),
        w.subtitle('Project proposal'),
        w.p(
          [
            bold('Prepared by '),
            run('Dana Whitfield, Digital Services'),
            bold('   Date '),
            run('8 March 2027'),
          ],
          {
            spaceAfter: 4,
          },
        ),
        w.rule(BLUE, 1, { spaceAfter: 12 }),
        w.h1('Overview'),
        w.p(
          'Members can only renew books at the desk or by phone, and the waiting list for popular titles lives on paper. We propose a small app that lets members search the catalogue, renew loans and join waiting lists from their phones.',
        ),
        w.h1('Goals'),
        ...w.bullets([
          'Half of all renewals made in the app within six months',
          'Waiting lists kept in one place that staff and members both see',
          'No new hardware: the app uses the catalogue we already run',
        ]),
        w.h1('Milestones'),
        w.table(
          [
            [
              { writing: [bold('Milestone')], background: PALE_BLUE },
              { writing: [bold('Date')], background: PALE_BLUE },
              { writing: [bold('Owner')], background: PALE_BLUE },
            ],
            ['Research with twenty members', 'April 2027', 'Dana'],
            ['First version for staff to test', 'June 2027', 'Rhys'],
            ['Open to all members', 'September 2027', 'Dana'],
          ],
          { shares: [3, 1.4, 1], headerRows: 1 },
        ),
        w.h1('Budget'),
        w.p('£18,000 for design and development, and £1,200 a year to run it.'),
      ],
    ),
};

// The writing of Pages's Project Brief article (packages/templates/src/article-template.ts), as a text document.
export const PROJECT_BRIEF: TextDocumentTemplate = {
  id: 'text-project-brief',
  name: 'Project brief',
  section: 'work',
  build: () =>
    templateDocument({ text: { font: 'Arial', size: 11 } }, (w) => [
      w.title('Project brief'),
      w.subtitle('What we are doing, why, and how we will know it worked'),
      w.h1('Summary'),
      w.p(
        'One paragraph a busy reader can stop after: what changes, for whom, and by when. Keep it to three sentences.',
      ),
      w.h1('Goals'),
      ...w.bullets([
        'A measurable outcome, with a number and a date',
        'A second one, only if it matters as much as the first',
      ]),
      w.h1('Plan'),
      ...w.numbered([
        'Talk to five customers about the problem',
        'Build the smallest version that tests the idea',
        'Launch it to a pilot group and measure',
      ]),
      w.h1('Open questions'),
      ...w.checklist(['Who signs off the launch?', 'What would make us stop?']),
      w.p(
        [
          italic('A plan is a guess written down, so we can see when it is wrong.', {
            color: GREY,
          }),
        ],
        {
          indentStart: 36,
          spaceBefore: 12,
        },
      ),
    ]),
};

export const BROCHURE: TextDocumentTemplate = {
  id: 'text-brochure',
  name: 'Brochure',
  section: 'work',
  build: () =>
    templateDocument(
      {
        text: { font: 'Montserrat', size: 10.5, color: '#263238' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.4 }, spaceAfter: 8 },
        styles: {
          title: { text: { size: 36, bold: true, color: GREEN }, paragraph: { spaceAfter: 0 } },
          subtitle: { text: { size: 15, color: '#263238' }, paragraph: { spaceAfter: 18 } },
          heading1: {
            text: { size: 14, bold: true, color: GREEN },
            paragraph: { spaceBefore: 16, spaceAfter: 4 },
          },
        },
      },
      (w) => [
        w.title('Greenway Cycles'),
        w.subtitle('Bike repairs and servicing, done while you wait'),
        w.p([bold('Open every day, 8am to 6pm  ·  14 Canal Street, Oxford')], {
          shading: PALE_GREEN,
          spaceAfter: 18,
          indentStart: 6,
        }),
        w.h1('What we do'),
        w.p(
          'From a puncture on the way to work to a full winter service, our mechanics fix most bikes the same day. We explain what we find and never fit a part you did not ask for.',
        ),
        w.h1('Services'),
        w.table(
          [
            [
              { writing: [bold('Puncture repair')], background: PALE_GREEN },
              { writing: '£12', background: PALE_GREEN },
            ],
            ['Safety check', '£20'],
            [
              { writing: [bold('Full service')], background: PALE_GREEN },
              { writing: '£65', background: PALE_GREEN },
            ],
            ['Wheel true and spoke repair', '£25'],
          ],
          { shares: [3, 1] },
        ),
        w.h1('Why riders choose us'),
        ...w.bullets([
          'Fixed prices, agreed before we start',
          'Free safety check with every repair',
          'Loan bikes while yours is in the workshop',
        ]),
        w.p(
          [bold('Book online at greenwaycycles.example or call 01865 496 0177', { color: GREEN })],
          {
            spaceBefore: 12,
            align: 'center',
          },
        ),
      ],
    ),
};

export const MEETING_NOTES: TextDocumentTemplate = {
  id: 'text-meeting-notes',
  name: 'Meeting notes',
  section: 'work',
  build: () =>
    templateDocument(
      {
        text: { font: 'Arial', size: 11, color: '#202124' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 6 },
        styles: {
          title: { text: { size: 24, bold: true }, paragraph: { spaceAfter: 2 } },
          heading2: {
            text: { size: 12, bold: true, color: ORANGE, transform: 'uppercase' },
            paragraph: { spaceBefore: 16 },
          },
        },
      },
      (w) => [
        w.title('Weekly team meeting'),
        w.p(
          [run('Tuesday 9 March 2027  ·  10:00 – 10:30  ·  Room 3 and online', { color: GREY })],
          { spaceAfter: 10 },
        ),
        w.h2('Attendees'),
        w.p('Leah Brooks, Marcus Webb, Aisha Rahman, Owen Price'),
        w.h2('Agenda'),
        ...w.numbered([
          'Last week’s actions',
          'Website launch date',
          'Hiring for the support role',
        ]),
        w.h2('Notes'),
        ...w.bullets([
          'The launch moves to 22 March, so the new help pages can go out with it.',
          'Two strong candidates for the support role; second interviews next week.',
          'Customer survey results arrive on Friday.',
        ]),
        w.h2('Action items'),
        ...w.checklist([
          [bold('Marcus: '), run('confirm the launch date with the agency')],
          [bold('Aisha: '), run('book second interviews')],
          [bold('Owen: '), run('share the survey results before next meeting')],
        ]),
      ],
    ),
};

export const NEWSLETTER: TextDocumentTemplate = {
  id: 'text-newsletter',
  name: 'Newsletter',
  section: 'work',
  build: () =>
    templateDocument(
      {
        text: { font: 'Georgia', size: 11, color: '#262626' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.4 }, spaceAfter: 8 },
        styles: {
          title: {
            text: { font: 'Arial', size: 34, bold: true, color: BLUE },
            paragraph: { align: 'center', spaceAfter: 2 },
          },
          heading1: {
            text: { font: 'Arial', size: 16, bold: true, color: '#202124' },
            paragraph: { spaceBefore: 16, spaceAfter: 4 },
          },
        },
      },
      (w) => [
        w.title('The Maple Street Post'),
        w.p([run('ISSUE 12  ·  MARCH 2027', { font: 'Arial', size: 9, bold: true, color: GREY })], {
          align: 'center',
          spaceAfter: 2,
        }),
        w.rule(BLUE, 2, { spaceAfter: 14 }),
        w.h1('The community garden opens'),
        w.p([italic('By Hannah Cole', { color: GREY })], { spaceAfter: 4 }),
        w.p(
          'After two years of planning, the garden behind the old school opens on Saturday 3 April. Twenty plots are already taken, and there is a waiting list for the rest. Everyone is welcome at the opening, with cake and seedlings to take home.',
        ),
        w.h1('Street party: save the date'),
        w.p(
          'The summer street party returns on Saturday 19 June. We are looking for volunteers to help with tables, music and the bake-off. Reply to this newsletter if you can lend a hand.',
        ),
        w.h1('Dates for your diary'),
        ...w.bullets([
          [bold('20 March: '), run('litter pick, meet at the corner shop at 10am')],
          [bold('3 April: '), run('community garden opening')],
          [bold('19 June: '), run('street party')],
        ]),
      ],
    ),
};
