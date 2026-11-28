// A picture in a cell (docs/specs/029-sheets/inserted-objects.md "Images in a cell"): the input's checks (D630), and
// the engine reading it as an IMAGE's answer, its picture shown in its cell and through a reference or lookup (D631).
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { isCellPicture, pictureInput, pictureOfInput } from './cell-picture';

const at = (a1: string) => [Number(a1.slice(1)) - 1, a1.charCodeAt(0) - 65] as const;

function shown(b: ReturnType<typeof book>, a1: string) {
  const sheet = b.sheets[0]!;
  return { picture: b.wb.pictureOf(sheet.id, ...at(a1)), image: b.wb.imageOf(sheet.id, ...at(a1)) };
}

describe('a cell picture input', () => {
  it('is a gallery id with alt text kept only when given', () => {
    expect(pictureInput('img-1')).toEqual({ img: { id: 'img-1' } });
    expect(pictureInput('img-1', '')).toEqual({ img: { id: 'img-1' } });
    expect(pictureInput('img-1', 'A cow')).toEqual({ img: { id: 'img-1', alt: 'A cow' } });
    expect(pictureOfInput(pictureInput('img-1', 'A cow'))).toEqual({ id: 'img-1', alt: 'A cow' });
    expect(pictureOfInput({ n: 1 })).toBeNull();
    expect(pictureOfInput(undefined)).toBeNull();
  });

  it.each([
    [{ id: 'img-1' }, true],
    [{ id: 'img-1', alt: '' }, true],
    [{ id: 'img-1', alt: 'x'.repeat(1001) }, false],
    [{ id: 'data:x' }, false],
    [{ id: 'img-1', title: 'x' }, false],
    [null, false],
    [['img-1'], false],
  ])('checks %j', (x, ok) => {
    expect(isCellPicture(x)).toBe(ok);
  });
});

describe('a cell picture in the engine', () => {
  it('reads as empty text, not blank, and shows its picture in its cell', () => {
    const b = book({ B1: '=ISBLANK(A1)', C1: '=LEN(A1)', D1: '=A1&"x"' });
    b.put('A1', pictureInput('img-1', 'A cow'));
    expect(b.v('A1')).toBe('');
    expect(b.v('B1')).toBe(false);
    expect(b.v('C1')).toBe(0);
    expect(b.v('D1')).toBe('x');
    expect(shown(b, 'A1')).toEqual({ picture: { id: 'img-1', alt: 'A cow' }, image: null });
  });

  it('is shown through a reference and a lookup, as an IMAGE is', () => {
    const b = book({ A2: 'cow', C1: '=A1', C2: '=VLOOKUP("cow", A2:B2, 2, FALSE)', C3: '=B9' });
    b.put('A1', pictureInput('img-1'));
    b.put('B2', pictureInput('img-2'));
    expect(shown(b, 'C1').picture).toEqual({ id: 'img-1' });
    expect(shown(b, 'C2').picture).toEqual({ id: 'img-2' });
    expect(shown(b, 'C3').picture).toBeNull();
  });

  it('shows nothing once the cell holds anything else, or in a workbook with no picture', () => {
    const b = book({ A1: 'x', C1: '=A1' });
    expect(shown(b, 'A1').picture).toBeNull();
    b.put('A1', pictureInput('img-1'));
    expect(shown(b, 'C1').picture).toEqual({ id: 'img-1' });
    b.put('A1', { n: 3 });
    expect(b.v('C1')).toBe(3);
    expect(shown(b, 'C1').picture).toBeNull();
    expect(shown(b, 'A1').picture).toBeNull();
  });

  it("leaves an IMAGE's picture to imageOf and a cell's to pictureOf", () => {
    const b = book(
      { A1: '=IMAGE("https://example.com/a.png")' },
      { imports: { access: 'allowed' } },
    );
    b.put('B1', pictureInput('img-1'));
    expect(shown(b, 'A1').picture).toBeNull();
    expect(shown(b, 'A1').image).toMatchObject({ url: 'https://example.com/a.png' });
    expect(shown(b, 'B1')).toEqual({ picture: { id: 'img-1' }, image: null });
  });
});
