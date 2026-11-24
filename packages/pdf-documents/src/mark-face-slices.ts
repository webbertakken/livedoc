// The slices of Chinese, Japanese and Korean (docs/specs/035-pdf-documents/marks.md "Laying out", "Loading"): which
// slice holds each character of a region, and each slice's file, in a table of its own a region, loaded only by a bake
// or a surface that sets the region, then kept.
import { MARK_FACE_REGIONS, type MarkFaceRegion, type MarkFaceSlice } from './mark-face-families';

type SliceTable = { readonly MARK_FACE_SLICES: readonly MarkFaceSlice[] };

const TABLES: Readonly<Record<MarkFaceRegion, () => Promise<SliceTable>>> = {
  sc: () => import('./mark-face-slices-sc'),
  jp: () => import('./mark-face-slices-jp'),
  kr: () => import('./mark-face-slices-kr'),
};

const loading = new Map<MarkFaceRegion, Promise<readonly MarkFaceSlice[]>>();

export const MarkFaceSlices = {
  /** A region's slices, loaded once; a load that fails is tried afresh the next time. */
  load: (region: MarkFaceRegion): Promise<readonly MarkFaceSlice[]> => {
    const known = loading.get(region);
    if (known) return known;
    const load = TABLES[region]().then(({ MARK_FACE_SLICES }) => MARK_FACE_SLICES);
    loading.set(region, load);
    load.catch(() => loading.delete(region));
    return load;
  },

  /** The region a face sets, where it is a region's face (`noto-sans-jp-400`); null for any other. */
  regionOf: (face: string): MarkFaceRegion | null =>
    MARK_FACE_REGIONS.find((each) => `${each.package}-400` === face)?.region ?? null,

  /** The slice a file is, among the regions' slices; null where it is none of theirs. */
  sliceOf: async (file: string): Promise<MarkFaceSlice | null> => {
    const region = MARK_FACE_REGIONS.find((each) => file.startsWith(`${each.package}/`))?.region;
    if (!region) return null;
    return (await MarkFaceSlices.load(region)).find((slice) => slice.file === file) ?? null;
  },
} as const;
