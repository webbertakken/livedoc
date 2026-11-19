// Text as a lower kebab-case slug (`Thomas McClean` -> `thomas-mcclean`): accents folded, every run of anything but
// a letter or a digit one dash, no dash at either end. Empty when nothing usable is left. Linear in the text's
// length: the edges are trimmed by index, never by a regular expression that backtracks on a run of dashes.
export function kebabSlug(text: string): string {
  const dashed = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  let start = 0;
  let end = dashed.length;
  while (start < end && dashed[start] === '-') start += 1;
  while (end > start && dashed[end - 1] === '-') end -= 1;
  return dashed.slice(start, end);
}
