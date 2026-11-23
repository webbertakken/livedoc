// A picture's recolour and adjustments in DrawingML (docs/specs/034-text-documents/objects.md "In the formats"): the
// blip's effects `a:grayscl`, `a:duotone` of two plain colours, `a:lum` (`bright`, `contrast`) and `a:alphaModFix` (the
// opacity), in thousandths of a percent; read in any order, written in the model's (recolour, `a:lum`, opacity).
import { attributeOf, childElements, type XmlElement } from '@livedoc/office-packages';
import {
  PictureColours,
  type PictureAdjustment,
  type PictureColouring,
  type PictureRecolour,
} from '../model/picture-colours';

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
/** DrawingML's percentages: thousandths of a percent. */
const PER_PERCENT = 1000;
const INTEGER = /^-?\d+$/;
const HEX = /^[0-9a-f]{6}$/i;
const PRESET_COLOURS: Readonly<Record<string, string>> = { black: '#000000', white: '#ffffff' };

const isA = (e: XmlElement, local: string) => e.uri === A_NS && e.local === local;
const onlyAttributes = (e: XmlElement, ...names: string[]) =>
  e.attributes.every((a) => a.uri === '' && names.includes(a.local));

/** A plain colour of a duotone: `a:srgbClr` or black or white `a:prstClr`, changed by nothing. */
function colourOf(e: XmlElement): string | undefined {
  if (!onlyAttributes(e, 'val') || childElements(e).length > 0) return undefined;
  const val = attributeOf(e, '', 'val') ?? '';
  if (isA(e, 'srgbClr')) return HEX.test(val) ? `#${val.toLowerCase()}` : undefined;
  return isA(e, 'prstClr') ? PRESET_COLOURS[val] : undefined;
}

/** A percentage attribute in its range, as the adjustment it gives; `{}` when absent, undefined when not one. */
function percentOf(e: XmlElement, attribute: string, name: PictureAdjustment, from = 0, sign = 1) {
  const text = attributeOf(e, '', attribute);
  if (text === undefined) return { value: undefined };
  const value = from + (sign * Number(text)) / PER_PERCENT;
  return INTEGER.test(text) && PictureColours.inRange(name, value)
    ? { value: PictureColours.adjustment(name, value) }
    : undefined;
}

/**
 * The colouring the blip's effects give the picture (objects.md "Recolour and adjustments read"); undefined when they
 * give it one the model does not hold, or one effect twice, which keeps it.
 */
export function ooxmlColouringOf(effects: readonly XmlElement[]): PictureColouring | undefined {
  let recolour: PictureRecolour | undefined;
  const adjusted: Partial<Record<PictureAdjustment, number | undefined>> = {};
  const seen = new Set<string>();
  for (const e of effects) {
    const kind = isA(e, 'grayscl') || isA(e, 'duotone') ? 'recolour' : e.local;
    if (seen.has(kind)) return undefined;
    seen.add(kind);
    if (isA(e, 'grayscl')) {
      if (e.attributes.length > 0 || childElements(e).length > 0) return undefined;
      recolour = { kind: 'greyscale' };
    } else if (isA(e, 'duotone')) {
      const colours = childElements(e).map(colourOf);
      if (e.attributes.length > 0 || colours.length !== 2 || colours.includes(undefined))
        return undefined;
      recolour = PictureColours.recolour({ kind: 'duotone', dark: colours[0], light: colours[1] });
    } else if (isA(e, 'lum')) {
      if (!onlyAttributes(e, 'bright', 'contrast') || childElements(e).length > 0) return undefined;
      const brightness = percentOf(e, 'bright', 'brightness');
      const contrast = percentOf(e, 'contrast', 'contrast');
      if (!brightness || !contrast) return undefined;
      adjusted.brightness = brightness.value;
      adjusted.contrast = contrast.value;
    } else if (isA(e, 'alphaModFix')) {
      if (!onlyAttributes(e, 'amt') || childElements(e).length > 0) return undefined;
      const transparency = percentOf(e, 'amt', 'transparency', 100, -1);
      if (!transparency) return undefined;
      adjusted.transparency = transparency.value;
    } else return undefined;
  }
  return {
    ...(recolour ? { recolour } : {}),
    ...(adjusted.transparency ? { transparency: adjusted.transparency } : {}),
    ...(adjusted.brightness ? { brightness: adjusted.brightness } : {}),
    ...(adjusted.contrast ? { contrast: adjusted.contrast } : {}),
  };
}

const thousandths = (percent: number) => String(Math.round(percent * PER_PERCENT));
const srgb = (hex: string) => `<a:srgbClr val="${hex.slice(1).toUpperCase()}"/>`;

/** The blip's effects for the picture's colouring (objects.md "Recolour and adjustments written"); none when neutral. */
export function ooxmlColouringXml(picture: PictureColouring): string {
  const recolour = PictureColours.recolour(picture.recolour);
  const brightness = PictureColours.adjustment('brightness', picture.brightness);
  const contrast = PictureColours.adjustment('contrast', picture.contrast);
  const transparency = PictureColours.adjustment('transparency', picture.transparency);
  const lum = [
    brightness ? ` bright="${thousandths(brightness)}"` : '',
    contrast ? ` contrast="${thousandths(contrast)}"` : '',
  ].join('');
  return [
    recolour?.kind === 'greyscale' ? '<a:grayscl/>' : '',
    recolour?.kind === 'duotone'
      ? `<a:duotone>${srgb(recolour.dark)}${srgb(recolour.light)}</a:duotone>`
      : '',
    lum ? `<a:lum${lum}/>` : '',
    transparency ? `<a:alphaModFix amt="${thousandths(100 - transparency)}"/>` : '',
  ].join('');
}
