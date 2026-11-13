import { describe, expect, it } from 'vitest';
import { writeZip } from './zip-writer';
import { WALL_MAX_PHOTOS, wallPhotosOf } from './photo-wall-files';

// The photos of one wall, as picked (docs/specs/021-event-storming/event-storming.md Phase 11 "What a person does"):
// several files, zips of photos, or both, in file-name order.

const photo = (name: string, type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });
const zip = (name: string, entries: string[]) =>
  new File(
    [writeZip(entries.map((n) => ({ name: n, data: new Uint8Array(n.endsWith('/') ? 0 : 4) })))],
    name,
    { type: 'application/zip' },
  );

describe('wallPhotosOf', () => {
  it('orders picked photos by file name as people number them', async () => {
    const out = await wallPhotosOf([
      photo('IMG_10.jpg'),
      photo('IMG_9.jpg'),
      photo('IMG_2.png', 'image/png'),
    ]);
    expect(out.photos.map((f) => f.name)).toEqual(['IMG_2.png', 'IMG_9.jpg', 'IMG_10.jpg']);
    expect(out).toMatchObject({ skipped: 0, leftOut: 0 });
  });

  it('opens a zip of photos, skipping folders, other files and a zip inside it', async () => {
    const out = await wallPhotosOf([
      zip('Photos.zip', ['wall/', 'wall/2.jpg', 'wall/1.JPEG', 'notes.txt', 'inner.zip', 'w.webp']),
    ]);
    expect(out.photos.map((f) => [f.name, f.type])).toEqual([
      ['1.JPEG', 'image/jpeg'],
      ['2.jpg', 'image/jpeg'],
      ['w.webp', 'image/webp'],
    ]);
    expect(out.skipped).toBe(2);
  });

  it('takes zips and photos together, in one order', async () => {
    const out = await wallPhotosOf([photo('b.jpg'), zip('z.zip', ['a.jpg', 'c.png'])]);
    expect(out.photos.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg', 'c.png']);
  });

  it('counts a file that is no photo, and a zip it cannot open', async () => {
    const broken = new File([new Uint8Array([9, 9, 9])], 'broken.zip', { type: 'application/zip' });
    const out = await wallPhotosOf([photo('a.jpg'), photo('notes.pdf', 'application/pdf'), broken]);
    expect(out.photos.map((f) => f.name)).toEqual(['a.jpg']);
    expect(out.skipped).toBe(2);
  });

  it('counts a photo in a zip that cannot be read out of it', async () => {
    const bytes = new Uint8Array(await zip('z.zip', ['a.jpg', 'b.jpg']).arrayBuffer());
    // Break the first entry's local header.
    bytes[0] = 0;
    const out = await wallPhotosOf([new File([bytes], 'z.zip', { type: 'application/zip' })]);
    expect(out.photos.map((f) => f.name)).toEqual(['b.jpg']);
    expect(out.skipped).toBe(1);
  });

  it('keeps the first photos past the limit, and says how many were left out', async () => {
    const many = Array.from({ length: WALL_MAX_PHOTOS + 3 }, (_, i) => photo(`p${i}.jpg`));
    const out = await wallPhotosOf(many);
    expect(out.photos).toHaveLength(WALL_MAX_PHOTOS);
    expect(out.photos[0]!.name).toBe('p0.jpg');
    expect(out.leftOut).toBe(3);
  });

  it('knows a zip by its name when the browser gives no type', async () => {
    const untyped = new File([await zip('x.zip', ['a.jpg']).arrayBuffer()], 'x.ZIP', { type: '' });
    expect((await wallPhotosOf([untyped])).photos.map((f) => f.name)).toEqual(['a.jpg']);
  });
});
