// A picture in a cell in a sheet's image (docs/specs/029-sheets/inserted-objects.md "Images in a cell", sheet-store.md
// "Agents in a spreadsheet", Previews): the render model names the gallery picture a cell shows, held in it or read
// through its formula, so an image of the sheet draws it in its cell.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { pictureInput } from '../images/cell-picture';
import { renderWindow } from './render';

describe('renderWindow and pictures in cells', () => {
  it('names the picture a cell holds or reads, and none for other cells', () => {
    const b = book({ B1: '=A1', C1: 'text' });
    b.put('A1', pictureInput('img-1', 'A cow'));
    b.put('A2', pictureInput('img-2'));
    const id = b.sheets[0]!.id;
    const m = renderWindow(b.wb, id, { width: 400, height: 100 }, 'en-GB')!;
    const at = (r: number, c: number) => m.cells.find((x) => x.r === r && x.c === c);
    expect(at(0, 0)).toMatchObject({ text: '', picture: { id: 'img-1', alt: 'A cow' } });
    expect(at(0, 1)).toMatchObject({ text: '', picture: { id: 'img-1', alt: 'A cow' } });
    expect(at(1, 0)?.picture).toEqual({ id: 'img-2' });
    expect(at(0, 2)).not.toHaveProperty('picture');
  });
});
