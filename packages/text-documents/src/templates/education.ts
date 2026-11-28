// The Education section (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): a lesson plan and a class report. Pure data.
import { bold, run, templateDocument } from './template-writing';
import type { TextDocumentTemplate } from './template-types';

const INDIGO = '#3949ab';
const GREY = '#595959';
const PALE_INDIGO = '#e8eaf6';

export const LESSON_PLAN: TextDocumentTemplate = {
  id: 'text-lesson-plan',
  name: 'Lesson plan',
  section: 'education',
  build: () =>
    templateDocument(
      {
        text: { font: 'Arial', size: 11, color: '#202124' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.3 }, spaceAfter: 6 },
        styles: {
          title: { text: { size: 26, bold: true, color: INDIGO }, paragraph: { spaceAfter: 10 } },
          heading1: {
            text: { size: 14, bold: true, color: INDIGO },
            paragraph: { spaceBefore: 16 },
          },
        },
      },
      (w) => [
        w.title('Lesson plan: the water cycle'),
        w.table(
          [
            [
              { writing: [bold('Subject')], background: PALE_INDIGO },
              'Geography',
              { writing: [bold('Year')], background: PALE_INDIGO },
              'Year 5',
            ],
            [
              { writing: [bold('Teacher')], background: PALE_INDIGO },
              'Mr Adeyemi',
              { writing: [bold('Length')], background: PALE_INDIGO },
              '60 minutes',
            ],
          ],
          { shares: [1, 1.6, 1, 1.6] },
        ),
        w.h1('Objectives'),
        ...w.bullets([
          'Name the four stages of the water cycle',
          'Explain how the sun drives evaporation',
          'Draw and label the cycle from memory',
        ]),
        w.h1('Materials'),
        ...w.bullets([
          'A clear bowl, cling film, ice cubes and warm water',
          'Worksheet: the water cycle diagram',
        ]),
        w.h1('Lesson outline'),
        ...w.numbered([
          [bold('Starter (10 min): '), run('where does rain come from? Pairs share ideas.')],
          [bold('Demonstration (15 min): '), run('the water cycle in a bowl.')],
          [bold('Main task (25 min): '), run('label the diagram, then explain it to a partner.')],
          [bold('Plenary (10 min): '), run('three quick questions to check understanding.')],
        ]),
        w.h1('Assessment'),
        w.p('Collect the labelled diagrams; look for all four stages in the right order.'),
      ],
    ),
};

export const CLASS_REPORT: TextDocumentTemplate = {
  id: 'text-class-report',
  name: 'Class report',
  section: 'education',
  build: () =>
    templateDocument(
      {
        text: { font: 'Calibri', size: 11.5, color: '#202124' },
        paragraph: { lineHeight: { rule: 'multiple', value: 1.4 }, spaceAfter: 8 },
        styles: {
          title: {
            text: { font: 'Cambria', size: 30, color: INDIGO },
            paragraph: { spaceAfter: 2 },
          },
          subtitle: { text: { size: 14, color: GREY }, paragraph: { spaceAfter: 6 } },
          heading1: {
            text: { font: 'Cambria', size: 16, color: INDIGO },
            paragraph: { spaceBefore: 16 },
          },
        },
      },
      (w) => [
        w.title('How Plants Find the Light'),
        w.subtitle('Class report'),
        w.p([run('Isla Murray  ·  Science, Year 8  ·  12 March 2027', { color: GREY })], {
          spaceAfter: 14,
        }),
        w.rule(INDIGO, 1, { spaceAfter: 12 }),
        w.h1('Introduction'),
        w.p(
          'Plants on a windowsill lean towards the glass. We wanted to find out whether bean seedlings grow towards light, and how quickly they turn when the light moves.',
        ),
        w.h1('Method'),
        ...w.numbered([
          'We planted six bean seeds in pots of the same soil.',
          'Three pots went in a box with a hole cut in one side; three stayed in the open.',
          'Each day we measured the height and the angle of each seedling.',
        ]),
        w.h1('Results'),
        w.p(
          'All three seedlings in the box bent towards the hole within four days. The seedlings in the open grew straight up and were slightly shorter.',
        ),
        w.h1('Conclusion'),
        w.p(
          'Bean seedlings grow towards light, and they turn within days when the light comes from one side.',
        ),
      ],
    ),
};
