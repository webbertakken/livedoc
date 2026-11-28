// A sheet's pictures in ODF (docs/specs/029-sheets/standard-mapping.md "Pictures in the file", D626): a `draw:frame` per
// picture in the cell it is anchored to, at its offset into that cell, after the cell's charts, holding a `draw:image`
// of its bytes: a package's `Pictures/<n>.<ext>` entry (one an image, however many sheets place it), a flat file's
// inline base64.
import {
  base64OfBytes,
  escapeXmlAttribute,
  escapeXmlText,
  PICTURE_EXTENSIONS,
} from '@livedoc/office-packages';
import { COLUMN_WIDTH_NEW, ROW_HEIGHT_NEW } from '../limits';
import { lineSizePx } from './file-lines';
import { cellOf } from './ods-charts';
import {
  cellPictureBytes,
  picturesWithBytes,
  type FilePicture,
  type FilePictureBytes,
  type FilePictureFetches,
} from './file-pictures';
import type { FileLoss, FileSheet } from './workbook-file';

// A px at 100% in centimetres (96 px to the inch), as the charts' frames are measured.
const CM_PER_PX = 2.54 / 96;
const cm = (px: number) => `${(px * CM_PER_PX).toFixed(3)}cm`;

// A flat file's base64 lines, as LibreOffice wraps them.
const BASE64_LINE = 76;

export class OdsPictures {
  /** The package's picture entries, each once. */
  readonly entries: { name: string; mediaType: string; data: Uint8Array }[] = [];
  private readonly named = new Map<string, string>();
  private n = 0;

  private readonly flat: boolean;
  // The entries the file kept (`Pictures/...`), which no new picture is named.
  private readonly taken: ReadonlySet<string>;
  private readonly bytes: FilePictureFetches | undefined;
  private readonly losses: FileLoss[];

  constructor(
    flat: boolean,
    taken: ReadonlySet<string>,
    bytes: FilePictureFetches | undefined,
    losses: FileLoss[],
  ) {
    this.flat = flat;
    this.taken = taken;
    this.bytes = bytes;
    this.losses = losses;
  }

  /**
   * A sheet's picture frames by the cell each is anchored in (`r,c`), in paint order, their z-index after `z0`
   * (the sheet's charts); a picture without its bytes left out and named.
   */
  frames(
    sheet: { name: string; pictures?: readonly FilePicture[] },
    z0: number,
  ): Map<string, string> {
    const frames = new Map<string, string>();
    picturesWithBytes(sheet, this.bytes, this.losses).forEach(({ picture, bytes }, i) => {
      const frame = [
        `<draw:frame draw:z-index="${z0 + i}" draw:name="Picture ${i + 1}" svg:x="${cm(picture.at.dx)}" svg:y="${cm(picture.at.dy)}" svg:width="${cm(picture.width)}" svg:height="${cm(picture.height)}">`,
        this.imageXml(picture.imageId, bytes),
        picture.alt ? `<svg:desc>${escapeXmlText(picture.alt)}</svg:desc>` : '',
        '</draw:frame>',
      ].join('');
      const at = `${picture.at.r},${picture.at.c}`;
      frames.set(at, (frames.get(at) ?? '') + frame);
    });
    return frames;
  }

  /**
   * A sheet's pictures in cells by their cell (`r,c`), each filling its cell and ending in it, LibreOffice's "To cell
   * (resize with cell)" (D634), their z-index after `z0`; one without its bytes left out and named.
   */
  cellFrames(sheet: Pick<FileSheet, 'name' | 'cells' | 'lines'>, z0: number): Map<string, string> {
    const frames = new Map<string, string>();
    let n = 0;
    for (const cell of sheet.cells) {
      if (!cell.picture) continue;
      const bytes = cellPictureBytes(sheet.name, cell.picture, this.bytes, this.losses);
      if (!bytes) continue;
      const width = cm(lineSizePx(sheet.lines?.c, cell.c, COLUMN_WIDTH_NEW));
      const height = cm(lineSizePx(sheet.lines?.r, cell.r, ROW_HEIGHT_NEW));
      const end = escapeXmlAttribute(cellOf(sheet.name, cell.r, cell.c));
      frames.set(
        `${cell.r},${cell.c}`,
        [
          `<draw:frame draw:z-index="${z0 + n}" draw:name="Picture in cell ${++n}" table:end-cell-address="${end}" table:end-x="${width}" table:end-y="${height}" svg:x="0cm" svg:y="0cm" svg:width="${width}" svg:height="${height}">`,
          this.imageXml(cell.picture.imageId, bytes),
          cell.picture.alt ? `<svg:desc>${escapeXmlText(cell.picture.alt)}</svg:desc>` : '',
          '</draw:frame>',
        ].join(''),
      );
    }
    return frames;
  }

  private imageXml(imageId: string, bytes: FilePictureBytes): string {
    if (this.flat) {
      const text = base64OfBytes(bytes.data).replace(
        new RegExp(`(.{${BASE64_LINE}})`, 'g'),
        '$1\n',
      );
      return `<draw:image><office:binary-data>${text}</office:binary-data></draw:image>`;
    }
    return `<draw:image xlink:href="${this.entryOf(imageId, bytes)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`;
  }

  // The image's package entry, named `Pictures/<n>.<ext>` past the entries the file kept, added once.
  private entryOf(imageId: string, bytes: FilePictureBytes): string {
    const had = this.named.get(imageId);
    if (had) return had;
    let name: string;
    do name = `Pictures/${++this.n}.${PICTURE_EXTENSIONS[bytes.type]}`;
    while (this.taken.has(name));
    this.named.set(imageId, name);
    this.entries.push({ name, mediaType: bytes.type, data: bytes.data });
    return name;
  }
}
