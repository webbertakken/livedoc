import { describe, expect, it } from 'vitest';
import {
  isPresenceOpKind,
  parsePdfDraft,
  PDF_DRAFT_MAX_CHARS,
  PDF_DRAFT_MAX_POINTS,
} from './index';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "A mark as it is made": a Drawing's stroke as it is drawn,
// relayed as presence, checked field by field before anyone draws it.

const stroke = {
  kind: 'pdf-draft',
  tabId: 't',
  page: 'p:3',
  stroke: '5b1c3d2e-0f4a-4b6c-9d8e-7f6a5b4c3d2e',
  colour: '#e11d48',
  opacity: 0.8,
  width: 2,
  from: 0,
  points: [10, 20, 11.5, 21.25],
};

describe('pdf-draft on the wire', () => {
  it('is presence: unordered, never logged, stored or replayed', () => {
    expect(isPresenceOpKind('pdf-draft')).toBe(true);
  });

  it('keeps a stretch of a stroke: its page, id, look, where it starts and its points', () => {
    expect(parsePdfDraft(stroke)).toEqual({
      tabId: 't',
      page: 'p:3',
      stroke: stroke.stroke,
      look: { colour: '#e11d48', opacity: 0.8, width: 2 },
      from: 0,
      points: [10, 20, 11.5, 21.25],
    });
    expect(parsePdfDraft({ ...stroke, lineStyle: 'dashed', from: 40 })).toMatchObject({
      look: { colour: '#e11d48', opacity: 0.8, width: 2, lineStyle: 'dashed' },
      from: 40,
    });
  });

  it('keeps a stroke\u2019s end: the tab and the id, no points', () => {
    expect(
      parsePdfDraft({ kind: 'pdf-draft', tabId: 't', stroke: 'k-1', points: null }),
    ).toEqual({ tabId: 't', stroke: 'k-1', points: null });
  });

  it('carries nothing a sender added', () => {
    expect(parsePdfDraft({ ...stroke, html: '<b>', author: 'Ada' })).not.toHaveProperty('html');
  });

  it('keeps PDF_DRAFT_MAX_POINTS points in one op, and refuses one more', () => {
    const most = Array.from({ length: PDF_DRAFT_MAX_POINTS * 2 }, (_, at) => (at % 600) + 0.25);
    expect(parsePdfDraft({ ...stroke, points: most })?.points).toHaveLength(most.length);
    expect(parsePdfDraft({ ...stroke, points: [...most, 1, 1] })).toBeNull();
  });

  it('refuses an op that passes PDF_DRAFT_MAX_CHARS as it was sent', () => {
    expect(parsePdfDraft({ ...stroke, padding: 'x'.repeat(PDF_DRAFT_MAX_CHARS) })).toBeNull();
  });

  it.each([
    ['no op', null],
    ['no tab', { ...stroke, tabId: '' }],
    ['no stroke id', { ...stroke, stroke: '' }],
    ['a stroke id that is no token', { ...stroke, stroke: 'a b' }],
    ['a stroke id too long', { ...stroke, stroke: 'a'.repeat(65) }],
    ['a page name that is no token', { ...stroke, page: '<img>' }],
    ['no page', { ...stroke, page: undefined }],
    ['a colour that is none', { ...stroke, colour: 'red' }],
    ['an opacity under the least', { ...stroke, opacity: 0.05 }],
    ['an opacity over one', { ...stroke, opacity: 1.5 }],
    ['no width', { ...stroke, width: 0 }],
    ['a width past 72 points', { ...stroke, width: 73 }],
    ['a line style that is none', { ...stroke, lineStyle: 'wavy' }],
    ['a solid line style, which is no style', { ...stroke, lineStyle: 'solid' }],
    ['a start before the stroke', { ...stroke, from: -2 }],
    ['a start at no whole point', { ...stroke, from: 1.5 }],
    ['no points', { ...stroke, points: [] }],
    ['half a point', { ...stroke, points: [1, 2, 3] }],
    ['a point that is no number', { ...stroke, points: [1, '2'] }],
    ['a point that is not finite', { ...stroke, points: [1, Number.NaN] }],
    ['a point off any page', { ...stroke, points: [1, 28_801] }],
  ])('refuses %s', (_why, op) => {
    expect(parsePdfDraft(op)).toBeNull();
  });
});
