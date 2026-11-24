'use client';

// The link editor (docs/specs/034-text-documents/links-and-navigation.md "Links"): under the selection, Text and Link
// with Apply; as Link is typed in, the person's LiveDoc documents whose names hold the words and this document's
// headings and bookmarks, Up and Down to move, Enter to take one. Enter elsewhere applies, Escape or a press outside closes. What is refused is said under Link.
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  lucideBookmark,
  lucideFileText,
  lucideHeading,
  lucideLink,
  lucideType,
} from '@livedoc/icons/lucide';
import { lucideGlyph, useClickOutside } from '@livedoc/ui';
import { OfficePopup, OFFICE_POPUP } from '@/components/office/OfficePopup';
import type { Box } from '@/lib/office/popup-place';
import {
  documentAddress,
  matchingDocuments,
  type LinkDocument,
} from '@/lib/text-document/text-document-links';
import type { PlaceTarget } from './useTextDocumentLinks';

const TextGlyph = lucideGlyph(lucideType, 18);
const LinkGlyph = lucideGlyph(lucideLink, 18);
const DocumentGlyph = lucideGlyph(lucideFileText, 16);
const BookmarkGlyph = lucideGlyph(lucideBookmark, 16);
const HeadingGlyph = lucideGlyph(lucideHeading, 16);
const GLYPHS = {
  documents: DocumentGlyph,
  headings: HeadingGlyph,
  bookmarks: BookmarkGlyph,
} as const;

/** One suggestion under Link: a LiveDoc document, or a heading or bookmark of this document. */
type Offer = { group: keyof typeof GLYPHS; key: string; label: string; href: string };
// The order is (default) until a capture (links-and-navigation.md "Heading links").
const GROUPS = [
  ['documents', 'LiveDoc documents'],
  ['headings', 'Headings'],
  ['bookmarks', 'Bookmarks'],
] as const;

const FIELD =
  'h-8 min-w-0 flex-1 rounded border border-(--office-line) bg-transparent px-2 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function TextDocumentLinkEditor({
  anchor,
  text: openText,
  href,
  documents,
  places,
  origin,
  onApply,
  onClose,
}: {
  anchor: Box;
  // The text the editor opens with; null for a selection across paragraphs, which keeps its text (no Text field).
  text: string | null;
  href: string;
  documents: readonly LinkDocument[];
  // This document's headings and bookmarks holding the typed words.
  places: (typed: string) => readonly PlaceTarget[];
  origin: string;
  // Applies Text and Link; answers what is refused, or null once applied.
  onApply: (text: string | null, link: string) => string | null;
  onClose: () => void;
}) {
  const id = useId();
  const box = useRef<HTMLFormElement>(null);
  const [text, setText] = useState(openText);
  const [link, setLink] = useState(href);
  const [problem, setProblem] = useState<string | null>(null);
  // What Link offers, for the words typed since it was last taken from.
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState(0);
  // The documents first, then this document's headings and bookmarks, one list to move through.
  const offered: Offer[] = [
    ...matchingDocuments(documents, typed).map((d): Offer => ({
      group: 'documents',
      key: `d:${d.id}`,
      label: d.name.trim() || 'Untitled',
      href: documentAddress(d.id, origin),
    })),
    ...(typed.trim()
      ? GROUPS.flatMap(([group]) =>
          places(typed)
            .filter((p) => p.group === group)
            .map((p): Offer => ({
              group,
              key: `${group}:${p.name}`,
              label: p.label,
              href: `#${p.name}`,
            })),
        )
      : []),
  ];
  const index = Math.min(chosen, Math.max(0, offered.length - 1));
  useClickOutside(box, onClose, true, OFFICE_POPUP);

  const take = (offer: Offer) => {
    setLink(offer.href);
    if (text === '') setText(offer.label);
    setTyped('');
    setProblem(null);
  };
  const apply = () => setProblem(onApply(text, link));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };
  const onLinkKeyDown = (e: KeyboardEvent) => {
    if (offered.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const by = e.key === 'ArrowDown' ? 1 : -1;
      setChosen((index + by + offered.length) % offered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      take(offered[index]!);
    }
  };

  const listId = `${id}-suggestions`;
  const listed = offered.length > 0;
  return (
    <OfficePopup anchor={anchor}>
      <form
        ref={box}
        aria-label="Link"
        data-text-document-link-editor
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="w-[26rem] max-w-[calc(100vw-1rem)] rounded-lg border border-(--office-line) bg-(--office-menu) p-3 text-sm text-(--office-ink) shadow-lg"
      >
        {text !== null ? (
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden="true" className="text-(--office-muted)">
              <TextGlyph />
            </span>
            <input
              aria-label="Text"
              value={text}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              className={FIELD}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-(--office-muted)">
            <LinkGlyph />
          </span>
          <input
            aria-label="Link"
            placeholder="Search or paste a link"
            value={link}
            // The editor opens on the address, as a paste is the commonest way in.
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listed}
            aria-controls={listed ? listId : undefined}
            aria-activedescendant={listed ? `${listId}-${index}` : undefined}
            aria-invalid={problem !== null}
            aria-describedby={problem !== null ? `${id}-problem` : undefined}
            onChange={(e) => {
              setLink(e.target.value);
              setTyped(e.target.value);
              setChosen(0);
              setProblem(null);
            }}
            onKeyDown={onLinkKeyDown}
            className={FIELD}
          />
          <button
            type="submit"
            className="h-8 shrink-0 rounded px-3 font-medium text-(--office-primary) hover:bg-(--office-menu-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          >
            Apply
          </button>
        </div>
        {problem !== null ? (
          <p id={`${id}-problem`} role="alert" className="mt-2 ml-7 text-xs text-(--office-error)">
            {problem}
          </p>
        ) : null}
        {listed ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="mt-2 border-t border-(--office-line) pt-1"
          >
            {GROUPS.map(([group, heading]) => {
              const members = offered.filter((o) => o.group === group);
              if (members.length === 0) return null;
              return (
                <div key={group} role="group" aria-labelledby={`${listId}-${group}`}>
                  <div
                    id={`${listId}-${group}`}
                    role="presentation"
                    className="px-2 pt-1 pb-0.5 text-xs font-medium text-(--office-muted)"
                  >
                    {heading}
                  </div>
                  {members.map((offer) => {
                    const at = offered.indexOf(offer);
                    const Glyph = GLYPHS[group];
                    return (
                      <div
                        key={offer.key}
                        id={`${listId}-${at}`}
                        role="option"
                        aria-selected={at === index}
                        // A press takes it without taking the focus from Link.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          take(offer);
                        }}
                        onMouseEnter={() => setChosen(at)}
                        className="flex h-8 cursor-default items-center gap-2 rounded px-2 aria-selected:bg-(--office-menu-hover)"
                      >
                        <span aria-hidden="true" className="text-(--office-muted)">
                          <Glyph />
                        </span>
                        <span className="min-w-0 truncate">{offer.label}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </form>
    </OfficePopup>
  );
}
