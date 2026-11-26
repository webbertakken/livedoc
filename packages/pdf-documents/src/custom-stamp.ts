// A custom stamp (docs/specs/035-pdf-documents/custom-stamps.md): a person's own stamp, its picture a blob, kept in
// LiveDoc for its owner and placed as any stamp is. What one is, read and checked the same by the api that keeps them,
// the browser that makes them and the mark that names one. Pure.
import { isBlobKey, type BlobKey } from '@livedoc/document';
import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_MAX_SIDE_PX,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
  PDF_MAX_PAGE_POINTS,
} from './limits';

/** The forms a custom stamp's picture is kept in. */
export const STAMP_PICTURE_TYPES = ['png', 'jpeg'] as const;
export type StampPictureType = (typeof STAMP_PICTURE_TYPES)[number];

/** A custom stamp's picture: its blob, its form and its size in pixels. */
export type StampPicture = {
  readonly key: BlobKey;
  readonly type: StampPictureType;
  readonly width: number;
  readonly height: number;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export const StampPictureBytes = {
  /** Whether bytes begin as their type's do: a PNG's signature, a JPEG's start of image. */
  fit: (type: StampPictureType, bytes: Uint8Array): boolean =>
    (type === 'png' ? PNG_SIGNATURE : JPEG_SIGNATURE).every((byte, at) => bytes[at] === byte),
} as const;

/** A custom stamp as it is made: what `POST /api/custom-stamps` takes. */
export type CustomStampInput = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly picture: StampPicture;
  /** The size it is placed at before it is held to a third of the page, in points. */
  readonly natural: { readonly width: number; readonly height: number };
};

/** A custom stamp as it is kept and listed: what `GET /api/custom-stamps` answers, newest first. */
export type CustomStampRecord = CustomStampInput & {
  readonly createdAt: number;
  readonly updatedAt: number;
};

/** What renaming or moving one changes. */
export type CustomStampPatch = { readonly name?: string; readonly category?: string };

export type CustomStampRefusal = 'custom_stamp_invalid';

export type CustomStampRead<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: CustomStampRefusal };

const ID = /^custom-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const invalid = { ok: false, refusal: 'custom_stamp_invalid' } as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isSide = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) > 0 && (n as number) <= PDF_CUSTOM_STAMP_MAX_SIDE_PX;

const isPoints = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= PDF_MAX_PAGE_POINTS;

/** A name or a category trimmed, where it is one: not empty, at most `max` characters. */
function labelOf(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const label = v.trim();
  return label !== '' && label.length <= max ? label : null;
}

function pictureOf(v: unknown): StampPicture | null {
  if (!isRecord(v) || !isBlobKey(v.key)) return null;
  if (!STAMP_PICTURE_TYPES.includes(v.type as StampPictureType)) return null;
  if (!isSide(v.width) || !isSide(v.height)) return null;
  return { key: v.key, type: v.type as StampPictureType, width: v.width, height: v.height };
}

export const CustomStamp = {
  /** Whether an id is a custom stamp's: `custom-` and a uuid, as the browser mints it. */
  isId: (id: string): boolean => ID.test(id),

  /** A picture where it is one, else null. */
  picture: pictureOf,

  /** A custom stamp to make, read from what was sent; trimmed. */
  input: (v: unknown): CustomStampRead<CustomStampInput> => {
    if (!isRecord(v) || typeof v.id !== 'string' || !ID.test(v.id)) return invalid;
    const name = labelOf(v.name, PDF_CUSTOM_STAMP_NAME_MAX_CHARS);
    const category = labelOf(v.category, PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS);
    const picture = pictureOf(v.picture);
    const natural = v.natural;
    if (!name || !category || !picture || !isRecord(natural)) return invalid;
    if (!isPoints(natural.width) || !isPoints(natural.height)) return invalid;
    return {
      ok: true,
      value: {
        id: v.id,
        name,
        category,
        picture,
        natural: { width: natural.width, height: natural.height },
      },
    };
  },

  /** A rename or a move between categories, read from what was sent: one field at least, each trimmed. */
  patch: (v: unknown): CustomStampRead<CustomStampPatch> => {
    if (!isRecord(v) || (v.name === undefined && v.category === undefined)) return invalid;
    const name =
      v.name === undefined ? undefined : labelOf(v.name, PDF_CUSTOM_STAMP_NAME_MAX_CHARS);
    const category =
      v.category === undefined
        ? undefined
        : labelOf(v.category, PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS);
    if (name === null || category === null) return invalid;
    return {
      ok: true,
      value: {
        ...(name !== undefined ? { name } : {}),
        ...(category !== undefined ? { category } : {}),
      },
    };
  },

  /** The `Name` a custom stamp is written under: `#` and its id, so Acrobat keeps its look when it turns it. */
  fileName: (id: string): string => `#${id}`,
} as const;
