// Images over cells for agents (docs/specs/029-sheets/inserted-objects.md "Images over cells", "Agents"): change_sheet's
// image places one of the caller's gallery pictures at a cell, sized as given or fitted to 600x400, in place of one
// with replace; clear_images takes one or all off; read_sheet lists them; an id the gallery lacks is refused before
// anything is written, as is a server keeping no images.
import { describe, expect, it } from 'vitest';
import { sheetFromJson, Workbook, WorkbookRecord, type SheetImage } from '@livedoc/sheets';
import { buildSheetChange } from './sheet-change-build';
import { DOC_A, fakeApi, library } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { changeSheet } from './change-sheet';
import { readSheet } from './read-sheet';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

const GALLERY = [
  { id: 'g-wide', contentType: 'image/png', byteSize: 9, width: 1200, height: 300, createdAt: 1 },
  { id: 'g-odd', contentType: 'image/png', byteSize: 9, width: 0, height: 0, createdAt: 2 },
];

function book(gallery: () => Response = () => Response.json({ images: GALLERY })) {
  const server = sheetServer(
    DOC_A,
    [sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [['a', 1]])],
    { workbook: WORKBOOK },
  );
  const api = fakeApi(Object.assign(server.routes, { ...library, '/images': gallery }));
  return { api, server };
}

const change = (api: ReturnType<typeof book>['api'], changes: unknown[]) =>
  changeSheet(api, DOC_A, { sheet: 'Models', changes: changes as never }, 'mcp');
const imagesOf = (server: ReturnType<typeof book>['server']) =>
  (server.sheets[0]!.layout.objects ?? []) as SheetImage[];

describe('change_sheet image', () => {
  it('places a gallery picture at a cell, fitted to 600x400, keeping its natural size and alt text', async () => {
    const { api, server } = book();
    const out = await change(api, [{ op: 'image', imageId: 'g-wide', at: 'B3', alt: ' Logo ' }]);
    const [image] = imagesOf(server);
    const { rows, cols } = server.sheets[0]!.layout;
    expect(image).toEqual({
      id: image!.id,
      kind: 'image',
      at: { r: rows[2], c: cols[1], dx: 0, dy: 0 },
      width: 600,
      height: 150,
      imageId: 'g-wide',
      naturalWidth: 1200,
      naturalHeight: 300,
      alt: 'Logo',
    });
    expect(out.applied).toEqual([`placed the image at B3 600x150 (image ${image!.id})`]);
    expect(out.changesetId).not.toBeNull();
  });

  it('sizes by both sides, or one side and the picture’s shape', async () => {
    const { api, server } = book();
    await change(api, [
      { op: 'image', imageId: 'g-wide', at: 'A1', width: 100, height: 90 },
      { op: 'image', imageId: 'g-wide', at: 'A1', width: 400 },
      { op: 'image', imageId: 'g-wide', at: 'A1', height: 50 },
      { op: 'image', imageId: 'g-odd', at: 'A1', width: 40 },
    ]);
    expect(imagesOf(server).map((x) => [x.width, x.height])).toEqual([
      [100, 90],
      [400, 100],
      [200, 50],
      [40, 40],
    ]);
    expect(imagesOf(server)[3]).not.toHaveProperty('naturalWidth');
  });

  it('lands a picture of unknown size square', async () => {
    const { api, server } = book();
    await change(api, [{ op: 'image', imageId: 'g-odd', at: 'A1' }]);
    expect(imagesOf(server)[0]).toMatchObject({ width: 400, height: 400 });
  });

  it('replaces one in its place, keeping its id', async () => {
    const { api, server } = book();
    await change(api, [{ op: 'image', imageId: 'g-wide', at: 'A1' }]);
    const id = imagesOf(server)[0]!.id;
    const out = await change(api, [{ op: 'image', imageId: 'g-odd', at: 'C4', replace: id }]);
    expect(imagesOf(server)).toHaveLength(1);
    expect(imagesOf(server)[0]).toMatchObject({ id, imageId: 'g-odd' });
    expect(out.applied[0]).toContain(`(in place of ${id})`);
  });

  it('refuses a cell that is none or past the sheet, a size out of bounds, long alt text, and a replace of none', async () => {
    const { api } = book();
    const code = async (c: unknown) => (await change(api, [c])).refusal;
    expect((await code({ op: 'image', imageId: 'g-wide', at: 'B?' }))?.code).toBe('range_invalid');
    expect((await code({ op: 'image', imageId: 'g-wide', at: 'ZZZ99999' }))?.code).toBe(
      'range_invalid',
    );
    expect((await code({ op: 'image', imageId: 'g-wide', at: 'A1', width: 8 }))?.message).toBe(
      'An image is 16 to 4000 px a side; this one would be 8x2. Nothing of this call was written.',
    );
    expect((await code({ op: 'image', imageId: 'g-wide', at: 'A1', height: 4001 }))?.code).toBe(
      'write_invalid',
    );
    expect(
      (await code({ op: 'image', imageId: 'g-wide', at: 'A1', alt: 'x'.repeat(1001) }))?.code,
    ).toBe('write_invalid');
    const none = await code({ op: 'image', imageId: 'g-wide', at: 'A1', replace: 'nope' });
    expect(none).toEqual({
      code: 'sheet_image_not_found',
      message:
        'No image "nope" on this sheet. Its images: none (read_sheet lists them). Nothing of this call was written.',
    });
  });

  it('refuses an id the gallery lacks before writing anything', async () => {
    const { api, server } = book();
    const out = await change(api, [
      { op: 'set', at: 'A1', rows: [['x']] },
      { op: 'image', imageId: 'g-none', at: 'A1' },
    ]);
    expect(out.refusal).toEqual({
      code: 'image_not_found',
      message:
        'imageId "g-none" is not in your image gallery: list_images lists the pictures you can place.',
    });
    expect(out.applied).toEqual([]);
    expect(imagesOf(server)).toEqual([]);
  });

  it('refuses on a server keeping no images, and throws its other faults', async () => {
    const off = book(() => Response.json({ error: 'images_unavailable' }, { status: 503 }));
    expect((await change(off.api, [{ op: 'image', imageId: 'g', at: 'A1' }])).refusal?.code).toBe(
      'images_unavailable',
    );
    const broken = book(() => Response.json({ error: 'boom' }, { status: 500 }));
    await expect(change(broken.api, [{ op: 'image', imageId: 'g', at: 'A1' }])).rejects.toThrow();
  });

  it('refuses every id of an empty gallery, and an image built without the gallery read', async () => {
    const empty = book(() => Response.json({}));
    expect(
      (await change(empty.api, [{ op: 'image', imageId: 'g-wide', at: 'A1' }])).refusal?.code,
    ).toBe('image_not_found');
    const wb = new Workbook({
      sheets: [sheetFromJson(sheetJson({ id: 'sheet_x', tabId: 't', title: 'X' }))],
      locale: 'en-GB',
    });
    const built = buildSheetChange(
      wb,
      'sheet_x',
      { op: 'image', imageId: 'g', at: 'A1' },
      [],
      Math.random,
      {
        spreadsheet: true,
      },
    );
    expect(built).toMatchObject({ ok: false, code: 'image_not_found' });
  });

  it('reads no gallery for changes placing no picture', async () => {
    let asked = 0;
    const { api } = book(() => {
      asked++;
      return Response.json({ images: GALLERY });
    });
    await change(api, [{ op: 'set', at: 'A1', rows: [['x']] }]);
    expect(asked).toBe(0);
  });

  it('refuses images on a Plan Sheet', async () => {
    const server = sheetServer(DOC_A, [
      sheetJson({ id: 'sheet_plan01', tabId: 't1', title: 'Costs' }),
    ]);
    const api = fakeApi(
      Object.assign(server.routes, { '/images': () => Response.json({ images: GALLERY }) }),
    );
    for (const c of [{ op: 'image', imageId: 'g-wide', at: 'A1' }, { op: 'clear_images' }]) {
      const out = await changeSheet(api, DOC_A, { sheet: 'Costs', changes: [c as never] }, 'mcp');
      expect(out.refusal?.code).toBe('not_spreadsheet');
    }
  });
});

describe('clear_images and read_sheet', () => {
  it('lists images with their cells, sizes and alt text, takes one off by id, then the rest', async () => {
    const { api, server } = book();
    await change(api, [
      { op: 'image', imageId: 'g-wide', at: 'B2', alt: 'Logo' },
      { op: 'image', imageId: 'g-odd', at: 'D5', width: 32 },
    ]);
    const [a, b] = imagesOf(server);
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(read.ok && read.images).toEqual([
      { id: a!.id, imageId: 'g-wide', at: 'B2', width: 600, height: 150, alt: 'Logo' },
      { id: b!.id, imageId: 'g-odd', at: 'D5', width: 32, height: 32 },
    ]);
    expect((await change(api, [{ op: 'clear_images', id: a!.id }])).applied).toEqual([
      `cleared the image ${a!.id} (1)`,
    ]);
    expect((await change(api, [{ op: 'clear_images', id: 'nope' }])).refusal?.code).toBe(
      'sheet_image_not_found',
    );
    expect((await change(api, [{ op: 'clear_images' }])).applied).toEqual([
      'cleared the sheet’s images (1)',
    ]);
    expect((await change(api, [{ op: 'clear_images' }])).applied).toEqual([
      'cleared the sheet’s images (none there)',
    ]);
    const after = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(after.ok && after.images).toBeUndefined();
  });
});
