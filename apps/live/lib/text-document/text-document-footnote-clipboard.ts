// Footnotes on the clipboard (docs/specs/034-text-documents/page-layout.md "Footnotes", "The mark"): a copied mark's
// note travels in the fragment as its writing; a pasted mark gets a note of its own. A mark whose note is here and no
// mark in the body names (cut, and pasted back) keeps it; one whose note another mark names gets a copy; one whose note
// is not here gets a new note holding the writing it brought, or an empty one.
import { Fragment, Node as PmNode, Slice } from 'prosemirror-model';
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { FOOTNOTE, STORY_PREFIX, storyFragment } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { NodeJson } from './text-document-clipboard-fragment';
import { makeNoteStory, marksIn } from './text-document-footnotes-edit';
import { copyStory } from './text-document-headers-edit';
import { textDocumentSchema } from './text-document-schema';

export type ClipboardNotes = {
  /** A note's writing, as the fragment carries it; null where the document holds no such note. */
  readonly read: (story: string) => NodeJson[] | null;
  /** The slice with each mark naming a note of its own, made here as it needs; `carried` is the fragment's writing. */
  readonly place: (slice: Slice, carried: Readonly<Record<string, NodeJson[]>>) => Slice;
};

const storyOf = (node: PmNode) => String((node.attrs as { story: unknown }).story);

export function footnoteClipboard(
  doc: Y.Doc,
  format: () => TextDocumentFormat,
  body: () => PmNode | null,
): ClipboardNotes {
  const holds = (story: string) => doc.share.has(`${STORY_PREFIX}${story}`);

  // A new note holding the writing a mark brought; an empty one where it brought none or none that reads.
  const made = (story: string, carried: readonly NodeJson[] | undefined): string => {
    if (!carried?.length) return makeNoteStory(doc, format());
    let node: PmNode;
    try {
      node = PmNode.fromJSON(textDocumentSchema, { type: 'doc', content: carried });
      node.check();
    } catch (error) {
      debugLog('[text-document] paste note refused', { story, error: String(error) });
      return makeNoteStory(doc, format());
    }
    const id = crypto.randomUUID();
    prosemirrorToYXmlFragment(node, storyFragment(doc, id));
    return id;
  };

  return {
    read: (story) =>
      holds(story)
        ? ((
            yXmlFragmentToProseMirrorRootNode(
              storyFragment(doc, story),
              textDocumentSchema,
            ).toJSON() as {
              content?: NodeJson[];
            }
          ).content ?? [])
        : null,
    place: (slice, carried) => {
      const named = new Set(
        marksIn(body() ?? textDocumentSchema.topNodeType.create()).map((m) => m.story),
      );
      const changes: string[] = [];
      const map = (fragment: Fragment): Fragment => {
        const nodes: PmNode[] = [];
        fragment.forEach((node) => {
          if (node.type.name !== FOOTNOTE) {
            nodes.push(node.isLeaf ? node : node.copy(map(node.content)));
            return;
          }
          const story = storyOf(node);
          let own: string;
          if (holds(story) && !named.has(story)) {
            own = story;
            changes.push('kept');
          } else if (holds(story)) {
            own = copyStory(doc, story);
            changes.push('copied');
          } else {
            own = made(story, carried[story]);
            changes.push('made');
          }
          // A second mark naming it in the same paste gets a copy of its own.
          named.add(own);
          nodes.push(node.type.create({ ...node.attrs, story: own }, null, node.marks));
        });
        return Fragment.from(nodes);
      };
      const content = map(slice.content);
      if (changes.length === 0) return slice;
      debugLog('[text-document] footnote', { change: 'pasted', notes: changes });
      return new Slice(content, slice.openStart, slice.openEnd);
    },
  };
}
