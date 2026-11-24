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
    expect(MarkFaces.runs(regular('न₹'))).toEqual([
      { face: 'noto-sans-devanagari-400', text: 'न₹' },
    ]);
    // A combining acute after a Cyrillic letter: Cyrillic's subset has it.
    expect(MarkFaces.runs(regular('и\u0301'))).toEqual([
      { face: 'noto-sans-cyrillic-400', text: 'и\u0301' },
    ]);
    // A space at the start has no face before it.
    expect(MarkFaces.runs(regular(' Ω'))[0]).toEqual({ face: 'noto-sans-latin-400', text: ' ' });
  });

  it('sets a bold line in the bold faces', () => {
    expect(MarkFaces.runs({ text: 'ΑΘΗΝΑ', bold: true })).toEqual([
      { face: 'noto-sans-greek-700', text: 'ΑΘΗΝΑ' },
    ]);
  });

  it('sets a character no face has as the missing box of the first face', () => {
    // A private-use character: no Noto face has one.
    expect(MarkFaces.runs(regular('Ω\u{E000}'))).toEqual([
      { face: 'noto-sans-greek-400', text: 'Ω' },
      { face: 'noto-sans-latin-400', text: '\u{E000}' },
    ]);
    expect(MarkFaces.width(regular('\u{E000}'))).toBe(600);
  });

  it('sets each further script in its own family', () => {
    expect(MarkFaces.runs(regular('שלום'))).toEqual([
      { face: 'noto-sans-hebrew-hebrew-400', text: 'שלום' },
    ]);
    expect(MarkFaces.runs(regular('سلام ١٢'))).toEqual([
      { face: 'noto-sans-arabic-arabic-400', text: 'سلام' },
      { face: 'noto-sans-latin-400', text: ' ' },
      { face: 'noto-sans-arabic-arabic-400', text: '١٢' },
    ]);
    for (const [word, face] of [
      ['Բարեւ', 'noto-sans-armenian-armenian-400'],
      ['გამარჯობა', 'noto-sans-georgian-georgian-400'],
      ['สวัสดี', 'noto-sans-thai-thai-400'],
      ['ສະບາຍດີ', 'noto-sans-lao-lao-400'],
      ['សួស្តី', 'noto-sans-khmer-khmer-400'],
      ['မင်္ဂလာပါ', 'noto-sans-myanmar-myanmar-400'],
      ['ሰላም', 'noto-sans-ethiopic-ethiopic-400'],
      ['ආයුබෝවන්', 'noto-sans-sinhala-sinhala-400'],
      ['নমস্কার', 'noto-sans-bengali-bengali-400'],
      ['નમસ્તે', 'noto-sans-gujarati-gujarati-400'],
      ['ਸਤਿ', 'noto-sans-gurmukhi-gurmukhi-400'],
      ['ನಮಸ್ಕಾರ', 'noto-sans-kannada-kannada-400'],
      ['നമസ്കാരം', 'noto-sans-malayalam-malayalam-400'],
      ['ନମସ୍କାର', 'noto-sans-oriya-oriya-400'],
      ['வணக்கம்', 'noto-sans-tamil-tamil-400'],
      ['నమస్కారం', 'noto-sans-telugu-telugu-400'],
    ] as const)
      expect(MarkFaces.runs(regular(word)), word).toEqual([{ face, text: word }]);
  });

  it('sets a bold line in a further script regular, its family having no bold', () => {
    expect(MarkFaces.runs({ text: 'Ω שלום', bold: true })).toEqual([
      { face: 'noto-sans-greek-700', text: 'Ω' },
      { face: 'noto-sans-latin-700', text: ' ' },
      { face: 'noto-sans-hebrew-hebrew-400', text: 'שלום' },
    ]);
  });

  it('sets symbols and emoji after every script, in one colour', () => {
    expect(MarkFaces.runs(regular('♔'))).toEqual([
      { face: 'noto-sans-symbols-2-symbols-400', text: '♔' },
    ]);
    expect(MarkFaces.runs(regular('⠃'))).toEqual([
      { face: 'noto-sans-symbols-2-symbols-400', text: '⠃' },
    ]);
    expect(MarkFaces.runs(regular('🜁'))).toEqual([
      { face: 'noto-sans-symbols-symbols-400', text: '🜁' },
    ]);
    const [face] = MarkFaces.runs(regular('🙂'));
    expect(face!.face).toMatch(/^noto-emoji-\d+-400$/);
  });

  it('sets a cluster whole in the first face that has all of it, so it is shaped as one', () => {
    // Each of these is in an earlier emoji slice alone than the one holding the sequence.
    expect(MarkFaces.runs(regular('Hi 👍🏽'))).toEqual([
      { face: 'noto-sans-latin-400', text: 'Hi ' },
      { face: 'noto-emoji-9-400', text: '👍🏽' },
    ]);
    expect(MarkFaces.runs(regular('👨‍👩‍👧'))).toEqual([{ face: 'noto-emoji-8-400', text: '👨‍👩‍👧' }]);
    expect(MarkFaces.runs(regular('🇳🇱'))).toEqual([{ face: 'noto-emoji-0-400', text: '🇳🇱' }]);
    // A keycap: Latin has the digit but not the keycap.
    expect(MarkFaces.runs(regular('1\uFE0F\u20E3'))).toEqual([
      { face: 'noto-emoji-2-400', text: '1\uFE0F\u20E3' },
    ]);
  });

  it('sets a cluster no face has whole character by character', () => {
    // Greek's subset has alpha but not the diaeresis; Latin's has the diaeresis but not alpha.
    expect(MarkFaces.runs(regular('α\u0308'))).toEqual([
      { face: 'noto-sans-greek-400', text: 'α' },
      { face: 'noto-sans-latin-400', text: '\u0308' },
    ]);
    // Cyrillic's subset has the acute but not the diaeresis: the acute stays with its letter.
    expect(MarkFaces.runs(regular('и\u0301\u0308'))).toEqual([
      { face: 'noto-sans-cyrillic-400', text: 'и\u0301' },
      { face: 'noto-sans-latin-400', text: '\u0308' },
    ]);
  });

  it('sets a bold cluster in the first bold face that has all of it, else the first regular', () => {
    expect(MarkFaces.runs({ text: 'и\u0301', bold: true })).toEqual([
      { face: 'noto-sans-cyrillic-700', text: 'и\u0301' },
    ]);
    expect(MarkFaces.runs({ text: '👍🏽', bold: true })).toEqual([
      { face: 'noto-emoji-9-400', text: '👍🏽' },
    ]);
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
