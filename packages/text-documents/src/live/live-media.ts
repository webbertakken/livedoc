// The gallery images a text document's pictures hold (docs/specs/034-text-documents/objects.md "Where the bytes live",
// "Referenced"): read from the state's pictures, the body's and every story's, never from media no picture holds, so
// the room's reference index names exactly what the document places.
import * as Y from 'yjs';
import { liveMediaOf } from './live-read';
import { BODY_FRAGMENT } from './live-root';
import { liveStoryIds, storyFragment } from './live-stories';
import { PICTURE } from './live-names';

function* pictureKeys(fragment: Y.XmlFragment): Generator<string> {
  for (const node of fragment.createTreeWalker(
    (n) => n instanceof Y.XmlElement && n.nodeName === PICTURE,
  )) {
    const key = (node as Y.XmlElement).getAttribute('media');
    if (typeof key === 'string') yield key;
  }
}

/** The ids of the gallery images the state's pictures hold, each once, in the order they are first met. */
export function liveGalleryImages(doc: Y.Doc): string[] {
  const keys = new Set(pictureKeys(doc.getXmlFragment(BODY_FRAGMENT)));
  for (const id of liveStoryIds(doc))
    for (const key of pictureKeys(storyFragment(doc, id))) keys.add(key);
  const images = new Set<string>();
  for (const key of keys) {
    const media = liveMediaOf(doc, key);
    if (media && !media.bytes) images.add(media.image);
  }
  return [...images];
}
