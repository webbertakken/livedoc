// A text document template's picture (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's
// text documents"): its first page, on white paper in the light scheme and dark paper in the dark; a blank page of the
// paper while it is being drawn. Decorative: the card names the template.
import type { TextTemplatePicture as Picture } from './useTextTemplatePictures';

export function TextTemplatePicture({
  picture,
  crop,
}: {
  picture: Picture | undefined;
  /** The top of the page's writing, filling a short card (the Explorer's pane); else the whole page. */
  crop: boolean;
}) {
  // A crop shows the writing from its first line: the page scaled and cut short of the narrowest
  // margins a template has (three quarters of an inch), so no template's first line is cut.
  const fit = crop
    ? 'aspect-[17/22] w-[125%] max-w-none -ml-[11%] -mt-[10%]'
    : 'aspect-[17/22] w-full';
  if (!picture) return <span aria-hidden className={`block bg-white dark:bg-[#1e1f20] ${fit}`} />;
  return (
    <>
      <img alt="" src={picture.light} className={`block dark:hidden ${fit}`} />
      <img alt="" src={picture.dark} className={`hidden dark:block ${fit}`} />
    </>
  );
}
