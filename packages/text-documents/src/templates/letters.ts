// The Letters section (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): a letter in a modern look and a formal letter in a classic one. Pure data.
import { bold, run, templateDocument } from './template-writing';
import type { TextDocument } from '../model/text-document';

const TEAL = '#00796b';
const GREY = '#595959';

export const LETTER = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Arial', size: 11, color: '#202124' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 10 },
      styles: {
        title: { text: { size: 24, bold: true, color: TEAL }, paragraph: { spaceAfter: 2 } },
      },
    },
    (w) => [
      w.title('Alex Morgan'),
      w.p(
        [
          run('12 Harbour Lane, Bristol BS1 4QA  ·  alex.morgan@example.com  ·  0117 496 0123', {
            color: GREY,
            size: 9,
          }),
        ],
        {
          spaceAfter: 4,
        },
      ),
      w.rule(TEAL, 1.5, { spaceAfter: 18 }),
      w.p('4 March 2027'),
      w.p([
        bold('Priya Patel'),
        run('\nHead of Community\nRiverside Arts Centre\n8 Quay Street, Bristol BS1 5TT'),
      ]),
      w.p('Dear Priya,'),
      w.p(
        'Thank you for showing me round the studios last week. Seeing the printmaking workshop in full swing made me even more keen to help, and I would love to volunteer on Saturday mornings from April.',
      ),
      w.p(
        'I have run community workshops for three years, most recently a weekly lino-cut class for adults at the library. I can help set up, guide beginners through their first prints and keep the space tidy for the next group.',
      ),
      w.p(
        'I have enclosed a short note of my availability and two references. If it would help, I am happy to come in for a trial session before the spring term begins.',
      ),
      w.p('Kind regards,', { spaceBefore: 6 }),
      w.p([bold('Alex Morgan')]),
    ],
  );

export const FORMAL_LETTER = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Times New Roman', size: 12, color: '#000000' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.15 }, spaceAfter: 12 },
    },
    (w) => [
      w.p('Jordan Ellis\n27 Elm Grove\nYork YO10 3HP\njordan.ellis@example.com', {
        align: 'end',
      }),
      w.p('10 March 2027'),
      w.p('Customer Relations\nNorthway Rail Ltd\nPO Box 4410\nLeeds LS1 9XZ'),
      w.p([bold('Re: Refund for cancelled journey, booking reference NR-48213')]),
      w.p('Dear Sir or Madam,'),
      w.p(
        'I am writing to request a full refund for the 08:15 service from York to London King’s Cross on 2 March 2027, which was cancelled less than an hour before departure.',
      ),
      w.p(
        'I bought an advance return ticket for £86.40. Because of the cancellation I missed a morning appointment and travelled on a later service at my own expense. Copies of my ticket and the replacement fare are enclosed.',
      ),
      w.p(
        'Under your passenger charter, a cancelled journey is refunded in full. I would be grateful if you could arrange this within fourteen days, to the card used for the booking.',
      ),
      w.p('Thank you for your attention to this matter.'),
      w.p('Yours faithfully,', { spaceAfter: 36 }),
      w.p('Jordan Ellis'),
      w.p([run('Enclosures: ticket, receipt for replacement fare', { italic: true, size: 10 })]),
    ],
  );
