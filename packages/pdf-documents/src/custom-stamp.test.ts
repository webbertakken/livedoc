import { describe, expect, it } from 'vitest';
import { CustomStamp, StampPictureBytes } from './custom-stamp';
import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_MAX_SIDE_PX,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
  PDF_MAX_PAGE_POINTS,
} from './limits';

const KEY = 'a'.repeat(64);
const ID = 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';

const input = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Paid',
  category: 'Accounts',
  picture: { key: KEY, type: 'png', width: 400, height: 200 },
  natural: { width: 300, height: 150 },
  ...over,
});

describe('CustomStamp.isId', () => {
  it('takes custom- and a uuid alone', () => {
    expect(CustomStamp.isId(ID)).toBe(true);
    expect(CustomStamp.isId('approved')).toBe(false);
    expect(CustomStamp.isId('custom-')).toBe(false);
    expect(CustomStamp.isId(`${ID}x`)).toBe(false);
    expect(CustomStamp.isId(ID.toUpperCase())).toBe(false);
  });
});

describe('CustomStamp.picture', () => {
  it('reads a picture of a key, a type and a size within the side', () => {
    expect(CustomStamp.picture({ key: KEY, type: 'jpeg', width: 1, height: 1 })).toEqual({
      key: KEY,
      type: 'jpeg',
      width: 1,
      height: 1,
    });
  });

  it.each([
    ['a key that is no key', { key: 'nope', type: 'png', width: 1, height: 1 }],
    ['a type it does not keep', { key: KEY, type: 'gif', width: 1, height: 1 }],
    ['a width of none', { key: KEY, type: 'png', width: 0, height: 1 }],
    ['a part pixel', { key: KEY, type: 'png', width: 1.5, height: 1 }],
    [
      'a side past the most',
      { key: KEY, type: 'png', width: PDF_CUSTOM_STAMP_MAX_SIDE_PX + 1, height: 1 },
    ],
    ['no picture', null],
  ])('reads %s as none', (_, value) => {
    expect(CustomStamp.picture(value)).toBeNull();
  });
});

describe('CustomStamp.input', () => {
  it('reads a whole input, its name and category trimmed', () => {
    const read = CustomStamp.input(input({ name: '  Paid  ', category: ' Accounts ' }));
    expect(read).toEqual({
      ok: true,
      value: {
        id: ID,
        name: 'Paid',
        category: 'Accounts',
        picture: { key: KEY, type: 'png', width: 400, height: 200 },
        natural: { width: 300, height: 150 },
      },
    });
  });

  it.each([
    ['an id of another form', { id: 'approved' }],
    ['an empty name', { name: '   ' }],
    ['a name too long', { name: 'n'.repeat(PDF_CUSTOM_STAMP_NAME_MAX_CHARS + 1) }],
    ['an empty category', { category: '' }],
    ['a category too long', { category: 'c'.repeat(PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS + 1) }],
    ['a picture of another form', { picture: { key: KEY, type: 'svg', width: 1, height: 1 } }],
    ['a natural size of none', { natural: { width: 0, height: 10 } }],
    ['a natural size past a page', { natural: { width: PDF_MAX_PAGE_POINTS + 1, height: 10 } }],
    ['a natural size not a number', { natural: { width: '10', height: 10 } }],
    ['who and when not a yes or no', { dynamic: 'yes' }],
  ])('refuses %s as custom_stamp_invalid', (_, over) => {
    expect(CustomStamp.input(input(over))).toEqual({ ok: false, refusal: 'custom_stamp_invalid' });
  });

  // custom-stamps.md "Making one": Show who and when.
  it('reads whether it shows who and when, kept only when it does', () => {
    expect(CustomStamp.input(input({ dynamic: true }))).toMatchObject({ value: { dynamic: true } });
    const off = CustomStamp.input(input({ dynamic: false }));
    expect(off.ok && off.value).not.toHaveProperty('dynamic');
  });

  it('refuses what is not an object', () => {
    expect(CustomStamp.input(null)).toEqual({ ok: false, refusal: 'custom_stamp_invalid' });
    expect(CustomStamp.input([])).toEqual({ ok: false, refusal: 'custom_stamp_invalid' });
  });
});

describe('CustomStamp.patch', () => {
  it('reads a name, a category, or both, trimmed', () => {
    expect(CustomStamp.patch({ name: ' Due ' })).toEqual({ ok: true, value: { name: 'Due' } });
    expect(CustomStamp.patch({ category: 'Bills' })).toEqual({
      ok: true,
      value: { category: 'Bills' },
    });
  });

  it('refuses a patch of nothing, or of a field of the wrong form', () => {
    expect(CustomStamp.patch({})).toEqual({ ok: false, refusal: 'custom_stamp_invalid' });
    expect(CustomStamp.patch({ name: '' })).toEqual({ ok: false, refusal: 'custom_stamp_invalid' });
    expect(CustomStamp.patch({ category: 3 })).toEqual({
      ok: false,
      refusal: 'custom_stamp_invalid',
    });
  });
});

describe('CustomStamp.fileName', () => {
  it('is # and the id, so Acrobat keeps its look when it turns it', () => {
    expect(CustomStamp.fileName(ID)).toBe(`#${ID}`);
  });
});

describe('StampPictureBytes.fit', () => {
  it('knows a PNG and a JPEG by how they begin', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(StampPictureBytes.fit('png', png)).toBe(true);
    expect(StampPictureBytes.fit('jpeg', jpeg)).toBe(true);
    expect(StampPictureBytes.fit('png', jpeg)).toBe(false);
    expect(StampPictureBytes.fit('jpeg', png)).toBe(false);
    expect(StampPictureBytes.fit('jpeg', new Uint8Array())).toBe(false);
  });
});
