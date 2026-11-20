// docs/specs/034-text-documents/editing-surface.md "The ruler": its marks, numbers and snapping in both units.
import { describe, expect, it } from 'vitest';
import { lengthText, RULER_STEP_PT, rulerMarks, snapPt } from './ruler-scale';

describe('rulerMarks', () => {
  it('marks every eighth of an inch from the left margin, longer at halves, numbered at wholes both ways', () => {
    const marks = rulerMarks(216, 72, 'in');
    expect(marks[0]).toEqual({ at: 0, kind: 'whole', label: '1' });
    expect(marks.find((m) => m.at === 72)).toEqual({ at: 72, kind: 'whole' });
    expect(marks.find((m) => m.at === 108)).toEqual({ at: 108, kind: 'half' });
    expect(marks.find((m) => m.at === 81)).toEqual({ at: 81, kind: 'minor' });
    expect(marks.at(-1)).toEqual({ at: 216, kind: 'whole', label: '2' });
    expect(marks).toHaveLength(25);
  });

  it('marks every quarter of a centimetre', () => {
    const marks = rulerMarks(100, 10, 'cm');
    expect(marks[0]!.at).toBeCloseTo(10 - RULER_STEP_PT.cm * 1, 3);
    const whole = marks.find((m) => m.label === '1')!;
    expect(whole.at).toBeCloseTo(10 + 72 / 2.54, 2);
    expect(marks.filter((m) => m.kind === 'half')[0]!.at).toBeCloseTo(10 + 36 / 2.54, 2);
  });
});

describe('snapPt and lengthText', () => {
  it('snaps to the nearest mark and reads in the unit', () => {
    expect(snapPt(40, 'in')).toBe(36);
    expect(snapPt(41, 'in')).toBe(45);
    expect(snapPt(10, 'cm')).toBeCloseTo(RULER_STEP_PT.cm * 1, 3);
    expect(lengthText(36, 'in')).toBe('0.5 in');
    expect(lengthText(72 / 2.54, 'cm')).toBe('1 cm');
  });
});
