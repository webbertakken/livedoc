// A picture's recolour and adjustments in ODF (docs/specs/034-text-documents/objects.md "In the formats"): in the
// frame's graphic style, `draw:luminance` and `draw:contrast` in percent, `draw:image-opacity` as 100% less the
// transparency, `draw:color-mode="greyscale"`, and a duotone, which ODF has no form for, as `livedoc:duotone`.
import {
  PictureColours,
  type PictureAdjustment,
  type PictureColouring,
  type PictureRecolour,
} from '../model/picture-colours';
import { LIVEDOC_NS, NS } from './odf-names';

const PERCENT = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))%$/;
const HEX_PAIR = /^(#[0-9a-f]{6})\s+(#[0-9a-f]{6})$/i;

/** The graphic style's attributes that colour a picture: the frame's adjustments, colour mode and duotone. */
const COLOURING: Readonly<Record<string, string>> = {
  luminance: NS.draw,
  contrast: NS.draw,
  'image-opacity': NS.draw,
  'color-mode': NS.draw,
  duotone: LIVEDOC_NS,
};

/** Whether the graphic style's attribute colours the picture: read by `odfColouringOf`, not as a neutral value. */
export const isOdfColouring = (a: { readonly uri: string; readonly local: string }): boolean =>
  COLOURING[a.local] === a.uri;

/** A percentage in its range as the adjustment it gives; undefined when it is not one. */
function percentOf(name: PictureAdjustment, text: string | undefined, from = 0, sign = 1) {
  if (text === undefined) return { value: undefined };
  const match = text.trim().match(PERCENT);
  const value = match ? from + sign * Number(match[1]) : Number.NaN;
  return PictureColours.inRange(name, value)
    ? { value: PictureColours.adjustment(name, value) }
    : undefined;
}

/**
 * The colouring the graphic style's colouring attributes (by local name) give the picture (objects.md "Recolour and
 * adjustments read"); undefined when they give it one the model does not hold, which keeps it.
 */
export function odfColouringOf(found: ReadonlyMap<string, string>): PictureColouring | undefined {
  const brightness = percentOf('brightness', found.get('luminance'));
  const contrast = percentOf('contrast', found.get('contrast'));
  const transparency = percentOf('transparency', found.get('image-opacity'), 100, -1);
  if (!brightness || !contrast || !transparency) return undefined;
  const mode = found.get('color-mode')?.trim() ?? 'standard';
  const duotone = found.get('duotone')?.trim().match(HEX_PAIR);
  if (found.has('duotone') && (!duotone || mode !== 'standard')) return undefined;
  if (mode !== 'standard' && mode !== 'greyscale') return undefined;
  const recolour: PictureRecolour | undefined = duotone
    ? PictureColours.recolour({ kind: 'duotone', dark: duotone[1], light: duotone[2] })
    : mode === 'greyscale'
      ? { kind: 'greyscale' }
      : undefined;
  return {
    ...(recolour ? { recolour } : {}),
    ...(transparency.value ? { transparency: transparency.value } : {}),
    ...(brightness.value ? { brightness: brightness.value } : {}),
    ...(contrast.value ? { contrast: contrast.value } : {}),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** The graphic style's attributes for the picture's colouring (objects.md "Recolour and adjustments written"). */
export function odfColouringAttributes(picture: PictureColouring): string {
  const brightness = PictureColours.adjustment('brightness', picture.brightness);
  const contrast = PictureColours.adjustment('contrast', picture.contrast);
  const transparency = PictureColours.adjustment('transparency', picture.transparency);
  const recolour = PictureColours.recolour(picture.recolour);
  return [
    brightness ? ` draw:luminance="${brightness}%"` : '',
    contrast ? ` draw:contrast="${contrast}%"` : '',
    transparency ? ` draw:image-opacity="${round3(100 - transparency)}%"` : '',
    recolour?.kind === 'greyscale' ? ' draw:color-mode="greyscale"' : '',
    recolour?.kind === 'duotone'
      ? ` xmlns:livedoc="${LIVEDOC_NS}" livedoc:duotone="${recolour.dark} ${recolour.light}"`
      : '',
  ].join('');
}
