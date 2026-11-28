// The pictures a spreadsheet's download holds (docs/specs/029-sheets/standard-mapping.md "Pictures in the file", D626,
// D634): each image its sheets place, over their cells or in them, once, read from the gallery when the document may serve it, in paint order within the
// file's budget; one past the budget marked `too_large`, one not served left out. The writers name each left out.
import { sheetImageIds, type Sheet } from '@livedoc/sheets';
import {
  cellPictureIds,
  filePictureType,
  picturesWithinBudget,
  type FilePictureFetch,
  type FilePictureFetches,
} from '@livedoc/sheets/files';
import { servableImageSizes } from '../db/image-grants';
import type { Env } from '../types';

export async function readWorkbookPictures(
  env: Env,
  documentId: string,
  sheets: readonly Pick<Sheet, 'layout' | 'cells'>[],
): Promise<FilePictureFetches> {
  const ids = [
    ...new Set(sheets.flatMap((s) => [...sheetImageIds(s.layout), ...cellPictureIds(s)])),
  ];
  if (ids.length === 0) return new Map();
  if (!env.IMAGES) {
    console.warn(`[workbook] pictures unavailable document=${documentId} placed=${ids.length}`);
    return new Map();
  }
  const servable = await servableImageSizes(env, documentId, ids);
  const sized = ids.flatMap((id): [string, number][] => {
    const s = servable.get(id);
    return s && filePictureType(s.contentType) ? [[id, s.byteSize]] : [];
  });
  const within = picturesWithinBudget(sized);
  const out = new Map<string, FilePictureFetch>();
  for (const [id] of sized) {
    if (!within.has(id)) {
      out.set(id, 'too_large');
      continue;
    }
    const object = await env.IMAGES.get(id);
    const type = filePictureType(object?.httpMetadata?.contentType);
    if (!object || !type) continue;
    out.set(id, { data: new Uint8Array(await object.arrayBuffer()), type });
  }
  const read = [...out.values()].filter((x) => x !== 'too_large').length;
  console.info(
    `[workbook] pictures document=${documentId} placed=${ids.length} read=${read} too_large=${out.size - read} unavailable=${ids.length - out.size}`,
  );
  return out;
}
