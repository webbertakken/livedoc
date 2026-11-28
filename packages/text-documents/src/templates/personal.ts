// The Personal section (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): an essay set as a school essay is, a report in an elegant serif look, and notes. Pure data.
import { bold, run, templateDocument } from './template-writing';
import type { TextDocument } from '../model/text-document';

const PLUM = '#6a1b4d';
const GREY = '#595959';
const INDENT = 36;

export const ESSAY = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Times New Roman', size: 12, color: '#000000' },
      paragraph: { lineHeight: { rule: 'multiple', value: 2 }, spaceAfter: 0 },
      styles: {
        title: { text: { size: 12, bold: false }, paragraph: { align: 'center', spaceAfter: 0 } },
      },
    },
    (w) => [
      w.p('Ruby Chen'),
      w.p('Ms Harrison'),
      w.p('English Literature'),
      w.p('14 March 2027'),
      w.title('The Sea as a Character in Two Coastal Novels'),
      w.p(
        'In both novels the sea is more than a setting. It moves the plot, it shapes how each family speaks, and it is the one thing no character can bargain with. This essay argues that the authors give the sea a will of its own, and that their characters are defined by how they answer it.',
        { indentFirst: INDENT },
      ),
      w.p(
        'The first novel opens with a storm that has already happened. We meet the village in its wreckage, and every conversation after that is shaped by what the water took. The second novel works the other way round: the sea is calm for most of the book, and the dread comes from waiting.',
        { indentFirst: INDENT },
      ),
      w.p(
        'Read together, the two books suggest that living beside the sea teaches a particular kind of patience, one that is neither hopeful nor resigned.',
        { indentFirst: INDENT },
      ),
    ],
  );

export const REPORT = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Georgia', size: 11, color: '#262626' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.4 }, spaceAfter: 10 },
      styles: {
        title: {
          text: { font: 'Playfair Display', size: 34, color: PLUM },
          paragraph: { spaceAfter: 4 },
        },
        subtitle: {
          text: { size: 14, color: GREY, italic: true },
          paragraph: { spaceAfter: 24 },
        },
        heading1: { text: { font: 'Playfair Display', size: 18, color: PLUM } },
        heading2: { text: { size: 13, bold: true, color: '#262626' } },
      },
    },
    (w) => [
      w.p([run('SPRING 2027', { size: 9, color: PLUM, bold: true })], { spaceAfter: 2 }),
      w.title('Growing Food in a Small Garden'),
      w.subtitle('What one season of raised beds taught us'),
      w.rule(PLUM, 0.75, { spaceAfter: 18 }),
      w.h1('Overview'),
      w.p(
        'Last spring we turned a six-metre strip of lawn into four raised beds. This report sets out what we planted, what grew, what did not, and what we would change next year.',
      ),
      w.h2('What we planted'),
      ...w.bullets([
        'Salad leaves, radishes and spring onions for quick harvests',
        'Runner beans and courgettes for the summer',
        'Garlic and leeks to see us through the winter',
      ]),
      w.h1('What we learned'),
      w.p(
        'Watering in the evening made the biggest difference. The beds that caught the afternoon sun gave twice the beans, and the slugs found everything we left near the fence.',
      ),
      w.p([
        bold('Next year: '),
        run('start seeds indoors two weeks earlier, and net the brassicas from the first day.'),
      ]),
    ],
  );

export const NOTES = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Arial', size: 11, color: '#202124' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 6 },
      styles: {
        title: { text: { size: 28, bold: true }, paragraph: { spaceAfter: 2 } },
        heading2: {
          text: { size: 13, bold: true, color: '#1a73e8' },
          paragraph: { spaceBefore: 16 },
        },
      },
    },
    (w) => [
      w.title('Notes'),
      w.p([run('Sunday 7 March 2027', { color: GREY })], { spaceAfter: 12 }),
      w.h2('Ideas for the holiday'),
      ...w.bullets([
        'Three nights in the Lake District, walking from Keswick',
        'Book the B&B by the end of the month: they fill up by Easter',
        'Bring the map case and the good flask',
      ]),
      w.h2('Things to remember'),
      w.p(
        'The library books are due back on Thursday. Mum’s birthday is on the 21st: order the flowers a week before.',
      ),
      w.h2('To do'),
      ...w.checklist([
        'Renew the car insurance',
        'Fix the bike’s back light',
        'Call the dentist about the check-up',
      ]),
    ],
  );
