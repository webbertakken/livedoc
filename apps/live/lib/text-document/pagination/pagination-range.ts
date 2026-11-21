// The one range a layout reads text through, per document (performance.md "A keystroke's frame"): every live range is
// updated by each node added to or taken from the document, until it is collected, so none is made per block.
const ranges = new WeakMap<Document, Range>();

/** The document's measuring range; set it (`selectNodeContents`) before each read. */
export function measuringRange(document: Document): Range {
  let range = ranges.get(document);
  if (!range) ranges.set(document, (range = document.createRange()));
  return range;
}
