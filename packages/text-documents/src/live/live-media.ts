// The pictures a text document's live state holds (docs/specs/034-text-documents/objects.md "Where the bytes live",
// "Referenced", "One drawing, one picture"): read from the body's and every story's pictures, never from media no
// picture holds, so the room's reference index names exactly what the document places; and how many pictures name each
// drawing tab.
import * as Y from 'yjs';
import { liveMediaOf } from './live-read';
import { liveTabFragments } from './live-tabs';
import { liveStoryIds, storyFragment } from './live-stories';
import { PICTURE } from './live-names';

function* picturesIn(fragment: Y.XmlFragment): Generator<Y.XmlElement> {
  for (const node of fragment.createTreeWalker(
    (n) => n instanceof Y.XmlElement && n.nodeName === PICTURE,
  ))
    yield node as Y.XmlElement;
}

/** Every picture of every document tab's body, then of every story. */
function* livePictures(doc: Y.Doc): Generator<Y.XmlElement> {
  for (const fragment of liveTabFragments(doc)) yield* picturesIn(fragment);
  for (const id of liveStoryIds(doc)) yield* picturesIn(storyFragment(doc, id));
}

/** The ids of the gallery images the state's pictures hold, each once, in the order they are first met. */
export function liveGalleryImages(doc: Y.Doc): string[] {
  const keys = new Set<string>();
  for (const picture of livePictures(doc)) {
    const key = picture.getAttribute('media');
    if (typeof key === 'string') keys.add(key);
  }
  const images = new Set<string>();
  for (const key of keys) {
    const media = liveMediaOf(doc, key);
    if (media && !media.bytes) images.add(media.image);
  }
  return [...images];
}

/** How many of the state's pictures name each drawing tab, by its id. */
export function liveDrawingNames(doc: Y.Doc): ReadonlyMap<string, number> {
  const names = new Map<string, number>();
  for (const picture of livePictures(doc)) {
    const drawing = picture.getAttribute('drawing');
    if (typeof drawing === 'string' && drawing) names.set(drawing, (names.get(drawing) ?? 0) + 1);
  }
  return names;
}
