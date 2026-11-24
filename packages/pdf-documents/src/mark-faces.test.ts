import { describe, expect, it } from 'vitest';
import { MARK_FACE_DATA } from './mark-face-data';
import { MarkFaces } from './mark-faces';

const regular = (text: string) => ({ text, bold: false });

// marks.md "Words in every script".
describe('the faces a mark is set in', () => {
  it('is Helvetica where Helvetica writes every character of every line', () => {
    expect(MarkFaces.setOf([regular('Cost (net) 5 €'), { text: 'APPROVED', bold: true }])).toBe(
      'helvetica',
    );
    expect(MarkFaces.setOf([])).toBe('helvetica');
  });

  it('is the mark faces where any line holds a character Helvetica cannot write', () => {
    expect(MarkFaces.setOf([regular('Approved'), regular('by Ελένη')])).toBe('noto');
    expect(MarkFaces.setOf([regular('Łódź')])).toBe('noto');
  });

  it('sets each character in the first face that has it, a run a face', () => {
    // Fontsource's Greek and Cyrillic subsets hold no space: a space is Latin's.
    expect(MarkFaces.runs(regular('Αθήνα Москва Łódź'))).toEqual([
      { face: 'noto-sans-greek-400', text: 'Αθήνα' },
      { face: 'noto-sans-latin-400', text: ' ' },
      { face: 'noto-sans-cyrillic-400', text: 'Москва' },
      { face: 'noto-sans-latin-400', text: ' ' },
      { face: 'noto-sans-latin-ext-400', text: 'Ł' },
      { face: 'noto-sans-latin-400', text: 'ód' },
      { face: 'noto-sans-latin-ext-400', text: 'ź' },
    ]);
  });

  it('keeps a space, a digit or an accent in the face before it where that face has it', () => {
    // The rupee sign is Latin Extended's first, and Devanagari's too.
    expect(MarkFaces.runs(regular('₹'))).toEqual([{ face: 'noto-sans-latin-ext-400', text: '₹' }]);
    expect(MarkFaces.runs(regular('न₹'))).toEqual([{ face: 'noto-sans-devanagari-400', text: 'न₹' }]);
    // A combining acute after a Cyrillic letter: Cyrillic's subset has it.
    expect(MarkFaces.runs(regular('и\u0301'))).toEqual([{ face: 'noto-sans-cyrillic-400', text: 'и\u0301' }]);
    // A space at the start has no face before it.
    expect(MarkFaces.runs(regular(' Ω'))[0]).toEqual({ face: 'noto-sans-latin-400', text: ' ' });
  });

  it('sets a bold line in the bold faces', () => {
    expect(MarkFaces.runs({ text: 'ΑΘΗΝΑ', bold: true })).toEqual([
      { face: 'noto-sans-greek-700', text: 'ΑΘΗΝΑ' },
    ]);
  });

  it('sets a character no face has as the missing box of the first face', () => {
    expect(MarkFaces.runs(regular('Ωא'))).toEqual([
      { face: 'noto-sans-greek-400', text: 'Ω' },
      { face: 'noto-sans-latin-400', text: 'א' },
    ]);
    expect(MarkFaces.width(regular('א'))).toBe(600);
  });

  it('measures a line by the advances of each face', () => {
    const greek = MARK_FACE_DATA.find((face) => face.id === 'noto-sans-greek-400')!;
    const run = greek.runs.find((each) => each[0]! <= 0x3a9 && 0x3a9 < each[0]! + each.length - 1);
    expect(run).toBeDefined();
    const omega = run![0x3a9 - run![0]! + 1]!;
    expect(MarkFaces.width(regular('ΩΩ'))).toBe(2 * omega);
    expect(MarkFaces.width(regular(''))).toBe(0);
  });
});
