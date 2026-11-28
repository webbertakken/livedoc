// The Resumes section (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): a classic resume in a serif look and a modern one with a coral accent. Pure data.
import { bold, italic, run, templateDocument } from './template-writing';
import type { TextDocument } from '../model/text-document';

const NAVY = '#1f3864';
const CORAL = '#c2410c';
const GREY = '#595959';

export const CLASSIC_RESUME = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Cambria', size: 11, color: '#000000' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.15 }, spaceAfter: 4 },
      margins: { top: 54, bottom: 54 },
      styles: {
        title: { text: { size: 26, color: NAVY }, paragraph: { align: 'center', spaceAfter: 2 } },
        heading1: {
          text: { size: 12, bold: true, color: NAVY, transform: 'uppercase' },
          paragraph: {
            spaceBefore: 14,
            spaceAfter: 6,
            borders: { bottom: { width: 0.75, dash: 'solid', color: NAVY, space: 2 } },
          },
        },
      },
    },
    (w) => [
      w.title('Samira Okafor'),
      w.p([run('Manchester  ·  07700 900123  ·  samira.okafor@example.com', { color: GREY })], {
        align: 'center',
        spaceAfter: 8,
      }),
      w.h1('Profile'),
      w.p(
        'Operations manager with eight years in logistics, known for calm planning and teams that keep their promises. Looking for a role leading regional distribution.',
      ),
      w.h1('Experience'),
      w.p(
        [
          bold('Operations Manager, '),
          run('Brightway Logistics'),
          run('\t2022 – present', { italic: true }),
        ],
        {
          tabStops: [{ position: 468, align: 'end' }],
        },
      ),
      ...w.bullets([
        'Led a team of 24 across two depots; on-time deliveries rose from 91% to 98%.',
        'Introduced weekly route reviews that cut fuel costs by 12% in a year.',
      ]),
      w.p(
        [
          bold('Shift Supervisor, '),
          run('Northgate Foods'),
          run('\t2018 – 2022', { italic: true }),
        ],
        {
          tabStops: [{ position: 468, align: 'end' }],
          spaceBefore: 6,
        },
      ),
      ...w.bullets([
        'Ran the night shift of a chilled warehouse handling 3,000 orders a night.',
        'Trained twelve new starters and wrote the site’s first safety handbook.',
      ]),
      w.h1('Education'),
      w.p(
        [
          bold('BSc Business Management, '),
          run('University of Salford'),
          run('\t2018', { italic: true }),
        ],
        {
          tabStops: [{ position: 468, align: 'end' }],
        },
      ),
      w.h1('Skills'),
      w.p(
        'Team leadership · Route planning · Warehouse systems (SAP EWM) · Health and safety (NEBOSH)',
      ),
      w.p([italic('References available on request.', { color: GREY })], { spaceBefore: 12 }),
    ],
  );

export const MODERN_RESUME = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Roboto', size: 10, color: '#202124' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 6 },
      margins: { top: 54, bottom: 54, left: 60, right: 60 },
      styles: {
        title: { text: { size: 28, bold: true }, paragraph: { spaceAfter: 0 } },
        subtitle: { text: { size: 13, color: CORAL }, paragraph: { spaceAfter: 6 } },
        heading1: {
          text: { size: 11, bold: true, color: CORAL },
          paragraph: { spaceBefore: 16, spaceAfter: 4 },
        },
        heading2: {
          text: { size: 11, bold: true },
          paragraph: { spaceBefore: 8, spaceAfter: 2 },
        },
      },
    },
    (w) => [
      w.title('Tom Lindqvist'),
      w.subtitle('Product designer'),
      w.p([run('tom.lindqvist@example.com  ·  +44 20 7946 0958  ·  London', { color: GREY })]),
      w.h1('ABOUT'),
      w.p(
        'I design calm, clear tools for busy people. Five years shaping mobile and web products, from first sketches to the details that make them feel finished.',
      ),
      w.h1('EXPERIENCE'),
      w.h2([
        run('Senior Product Designer, Fernleaf Health  '),
        run('2023 – present', { bold: false, color: GREY }),
      ]),
      ...w.bullets([
        'Redesigned appointment booking; completed bookings rose by a third.',
        'Built the design system the four product teams now share.',
      ]),
      w.h2([run('Product Designer, Kitebox  '), run('2020 – 2023', { bold: false, color: GREY })]),
      ...w.bullets([
        'Designed the first mobile app, rated 4.7 by 20,000 people.',
        'Ran monthly usability sessions with customers.',
      ]),
      w.h1('EDUCATION'),
      w.h2([
        run('BA Graphic Design, Kingston School of Art  '),
        run('2020', { bold: false, color: GREY }),
      ]),
      w.h1('SKILLS'),
      w.p(
        'Interaction design · Prototyping · Accessibility (WCAG 2.2) · Design systems · Research',
      ),
    ],
  );
