import { isPhotoAcceptedType } from '@livedoc/api-schema';
import { WALL_MAX_PHOTOS, naturalCompare } from '@livedoc/document';
import { ByteBudget } from './inflate';
import { listZip, readZipEntry } from './zip-reader';

// The photos of one wall, as the person picked them (docs/specs/021-event-storming/event-storming.md Phase 11 "What a
// person does"): several files, zips of photos as a phone's photo app exports them, or both mixed, opened here in the
// browser and put in file-name order. Folders, other files and a zip inside a zip are skipped and counted.

export { WALL_MAX_PHOTOS };
// The most a zip may inflate to, summed over its photos. Safe range: 100 MB to 500 MB.
export const WALL_MAX_ZIP_BYTES = 200 * 1024 * 1024;

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
const isZip = (file: File) => file.type === 'application/zip' || extensionOf(file.name) === 'zip';
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export type WallPhotos = {
  photos: File[];
  // Files that were not photos, and zips that could not be opened.
  skipped: number;
  // Photos past WALL_MAX_PHOTOS, from the end.
  leftOut: number;
};

async function photosInZip(file: File): Promise<{ photos: File[]; skipped: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const listed = listZip(bytes);
  if (!listed.ok) return { photos: [], skipped: 1 };
  const budget = new ByteBudget(WALL_MAX_ZIP_BYTES);
  const photos: File[] = [];
  let skipped = 0;
  for (const entry of listed.entries) {
    if (entry.name.endsWith('/')) continue;
    const type = TYPE_BY_EXTENSION[extensionOf(entry.name)];
    if (!type) {
      skipped += 1;
      continue;
    }
    const read = await readZipEntry(bytes, entry, budget);
    if (!read.ok) {
      skipped += 1;
      continue;
    }
    photos.push(new File([read.bytes], baseName(entry.name), { type }));
  }
  return { photos, skipped };
}

export async function wallPhotosOf(files: readonly File[]): Promise<WallPhotos> {
  const photos: File[] = [];
  let skipped = 0;
  for (const file of files) {
    if (isZip(file)) {
      const inZip = await photosInZip(file);
      photos.push(...inZip.photos);
      skipped += inZip.skipped;
    } else if (isPhotoAcceptedType(file.type)) photos.push(file);
    else skipped += 1;
  }
  photos.sort((a, b) => naturalCompare(a.name, b.name));
  const leftOut = Math.max(0, photos.length - WALL_MAX_PHOTOS);
  return { photos: photos.slice(0, WALL_MAX_PHOTOS), skipped, leftOut };
}
