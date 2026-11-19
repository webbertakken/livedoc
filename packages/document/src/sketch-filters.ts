// The Sketch finish's wobbles (docs/specs/008-canvas/finish.md "Sketch"): the filters icons, stickers and faces are
// drawn through, by id and as SVG markup. Read by the canvas's SketchFilterDefs, a tab window's edge and the export,
// so they agree; apart from the hand-drawn drawing itself, which loads only with a hand-drawn board
// (docs/specs/016-platform/web-performance.md).

/** The id of the hand-drawn wobble icons and stickers are drawn through under Sketch, in an export. */
export const SKETCH_ART_FILTER_ID = 'lvd-sketch-art';

/** The lighter wobble a face's ink is drawn through under Sketch (docs/specs/008-canvas/finish.md "Every other face is
 *  drawn by hand too"): one pass of one octave over a tight region. Faces are large, and the icons' two passes held
 *  a 200-chart board's zoom to 50-90 ms tasks; one pass held it under 50 ms. Read by the canvas's SketchFilterDefs
 *  and the export, so the two agree. */
export const SKETCH_FACE_FILTER = {
  id: 'lvd-sketch-face',
  /** Region past the face's box on each side, so a wobbled edge is not clipped. */
  margin: '5%',
  baseFrequency: 0.12,
  numOctaves: 1,
  seed: 7,
  /** Displacement, px (safe range: 2 to 4; past 4 small rules break up). */
  scale: 3,
} as const;

/** The face wobble as an SVG <filter>. */
export function svgSketchFaceFilter(): string {
  const f = SKETCH_FACE_FILTER;
  return (
    `<filter id="${f.id}" x="-${f.margin}" y="-${f.margin}" width="${100 + 2 * parseFloat(f.margin)}%" height="${100 + 2 * parseFloat(f.margin)}%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${f.baseFrequency}" numOctaves="${f.numOctaves}" seed="${f.seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${f.scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`
  );
}

/** The icons' and stickers' two-pass wobble as an SVG <filter> (the canvas's SketchFilterDefs draws the same): in the
 *  export, and in the still pictures WebKit's canvas draws that art into (SketchArtPicture). */
export function svgSketchArtFilter(): string {
  return (
    `<filter id="${SKETCH_ART_FILTER_ID}" x="-15%" y="-15%" width="130%" height="130%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="7" result="n1"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n1" scale="3" xChannelSelector="R" yChannelSelector="G" result="p1"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="2" seed="23" result="n2"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n2" scale="3" xChannelSelector="G" yChannelSelector="R" result="p2"/>` +
    `<feMerge><feMergeNode in="p1"/><feMergeNode in="p2"/></feMerge></filter>`
  );
}
