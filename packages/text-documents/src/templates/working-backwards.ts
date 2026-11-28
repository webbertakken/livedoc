// The Working Backwards template (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): Amazon's PR/FAQ for a FreshBox launch, written before anything is built, moved here from Pages's
// article template (fork D4) with its writing and its Report look: geometric headings in the accent, each with a rule
// under it, over a plain sans body. The press release, the Customer FAQ after a page break, the Internal FAQ and a
// checklist for the review. Pure data.
import type { TextDocument } from '../model/text-document';
import { bold, italic, run, templateDocument, type TemplateWriter } from './template-writing';

const ACCENT = '#1a56b8';
const GREY = '#595959';
const RULE = { width: 0.75, dash: 'solid', color: ACCENT, space: 2 } as const;

// A quote as the Report look sets one: italic, indented, a line down its left.
const quote = (w: TemplateWriter, words: string, by: string) =>
  w.p([italic(words), run(` ${by}`, { color: GREY })], {
    indentStart: 18,
    borders: { left: { width: 2, dash: 'solid', color: ACCENT, space: 8 } },
    spaceBefore: 6,
  });

// A question and its answer, as the FAQs are written.
const qa = (w: TemplateWriter, question: string, answer: string) => [w.h2(question), w.p(answer)];

export const WORKING_BACKWARDS = (): TextDocument =>
  templateDocument(
    {
      text: { font: 'Roboto', size: 11, color: '#202124' },
      paragraph: { lineHeight: { rule: 'multiple', value: 1.5 }, spaceAfter: 8 },
      styles: {
        title: {
          text: { font: 'Montserrat', size: 22, bold: true, color: ACCENT },
          paragraph: { spaceAfter: 6 },
        },
        subtitle: {
          text: { font: 'Montserrat', size: 13, color: GREY },
          paragraph: { spaceAfter: 14 },
        },
        heading1: {
          text: { font: 'Montserrat', size: 17, bold: true, color: ACCENT },
          paragraph: { spaceBefore: 18, spaceAfter: 8, borders: { bottom: RULE } },
        },
        heading2: {
          text: { font: 'Montserrat', size: 13, bold: true, color: ACCENT },
          paragraph: { spaceBefore: 14, spaceAfter: 6, borders: { bottom: RULE } },
        },
      },
    },
    (w) => [
      w.title(
        'FreshBox Tonight: dinner for two, delivered in two hours, on the table in twenty minutes',
      ),
      w.subtitle('No subscription and no planning: choose by 5pm, cook by 7.'),
      w.p([
        bold('LEEDS, 3 March 2027.'),
        run(' FreshBox today launched '),
        bold('FreshBox Tonight'),
        run(
          ', a meal kit you order on the day. Pick one of six dinners by 5pm and a courier brings it by 7, every ingredient weighed out for two and ready to cook in twenty minutes. There is no subscription and no box to skip: you order when you want dinner, and pay £14 for the two of you.',
        ),
      ]),
      w.h2('The problem'),
      w.p(
        'Most weeknights start at 6pm with the same question: what are we eating? Busy couples tell us they plan on Sunday, shop on Monday and throw out a third of it by Friday, and the rest of the week is a takeaway they did not want to pay for. A weekly kit helps the planners, but 61% of the people who try one leave because their week does not stay still.',
      ),
      w.h2('The solution'),
      w.p(
        'FreshBox Tonight takes the plan out of dinner. Open the app after lunch, pick from tonight’s six dinners and choose a delivery hour. Our Leeds kitchen packs it fresh, and a courier brings it in a cold bag. Every recipe takes twenty minutes and one pan, with nothing left over.',
      ),
      quote(
        w,
        '“We built FreshBox for people who want to cook but never have the week to plan it. Tonight is FreshBox for the evenings that just happen.”',
        'Priya Shah, founder of FreshBox',
      ),
      w.h2('How it works'),
      ...w.numbered([
        'Choose one of six dinners by 5pm, on your phone or the website',
        'Pick a one-hour delivery slot between 5pm and 8pm',
        'Cook it in twenty minutes from a card with a photo of every step',
      ]),
      quote(
        w,
        '“I order it on the train home and it is at the door before I have found my keys. It is the first thing that has actually stopped us ordering pizza.”',
        'Sam, a nurse in Headingley',
      ),
      w.h2('Getting started'),
      w.p(
        'FreshBox Tonight is available today across Leeds, from £14 for two. Download the FreshBox app or visit freshbox.example/tonight. Subscribers get their first Tonight dinner free.',
      ),
      w.h1('Customer FAQ', { pageBreakBefore: true }),
      ...qa(
        w,
        'Do I need a subscription?',
        'No. You order Tonight when you want it and pay for that dinner only. Subscribers can add a Tonight dinner to any week.',
      ),
      ...qa(
        w,
        'What if I am not in when it arrives?',
        'Choose Leave Safe and the courier leaves it in its cold bag, which keeps it cool for four hours. We send a photo when it is delivered.',
      ),
      ...qa(
        w,
        'Can I cater for allergies?',
        'Every dinner lists all 14 major allergens, and two of each night’s six are vegetarian. We cannot promise a kitchen free from nuts or gluten.',
      ),
      ...qa(
        w,
        'How fresh is it?',
        'It is packed in our Leeds kitchen within two hours of reaching you, from the same six farms as our weekly boxes.',
      ),
      ...qa(
        w,
        'Where do you deliver?',
        'Everywhere inside the Leeds ring road at launch, then York and Harrogate in the summer.',
      ),
      w.h1('Internal FAQ'),
      ...qa(
        w,
        'Why now?',
        'Our courier partner already runs two-hour slots across Leeds, and our kitchen stands idle after 2pm. Tonight uses both at almost no fixed cost.',
      ),
      ...qa(
        w,
        'How big is the opportunity?',
        '38,000 households in Leeds order a weeknight takeaway at least twice a week (our local panel, January 2027). Winning 5% of them once a fortnight is 950 dinners a week: about £690,000 a year in revenue.',
      ),
      ...qa(
        w,
        'What does it cost to build?',
        'Ten weeks for a team of five: same-day ordering in the app, a packing screen for the kitchen, and slot booking through the courier’s API. The kitchen needs one more shift a day, about £1,800 a week.',
      ),
      w.h2('What are the riskiest assumptions?'),
      ...w.bullets([
        'People will pay £14 for a dinner they still have to cook',
        'The kitchen can pack 150 orders between 2pm and 6pm',
        'Couriers can hold a one-hour slot at the evening peak',
      ]),
      ...qa(
        w,
        'What would make us stop?',
        'Fewer than one in five first-time customers ordering again within a month of the pilot, or more than one delivery in ten arriving late.',
      ),
      w.h2('How will we know it worked?'),
      ...w.bullets([
        [bold('Repeat rate: '), run('35% order again within 30 days')],
        [bold('On time: '), run('95% of dinners arrive inside their slot')],
        [bold('Margin: '), run('£3.50 a dinner after delivery')],
        [
          bold('Cannibalisation: '),
          run('under 10% of Tonight orders come from subscribers skipping a box'),
        ],
      ]),
      w.h1('Before the review'),
      ...w.checklist(
        [
          'The press release reads well to someone outside the team',
          'Every number has its source beside it',
          'Finance has checked the margin',
          'A pilot with 200 households is agreed',
        ],
        {},
        [true, false, false, false],
      ),
    ],
  );
