'use client';

// The link editor (docs/specs/034-text-documents/links-and-navigation.md "Links", and a spreadsheet's,
// docs/specs/029-sheets/inserted-objects.md "Insert Link"): under the selection, Text and Link with Apply; as Link is
// typed in, the suggestions its owner offers in their groups (a text document's documents, headings and bookmarks; a
// spreadsheet's range, sheets and documents), Up and Down to move, Enter to take one. Enter elsewhere applies, Escape
// or a press outside closes. What is refused is said under Link.
import { useId, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { lucideLink, lucideType } from '@livedoc/icons/lucide';
import { lucideGlyph, useClickOutside } from '@livedoc/ui';
import { OfficePopup, OFFICE_POPUP } from '@/components/office/OfficePopup';
import type { Box } from '@/lib/office/popup-place';

const TextGlyph = lucideGlyph(lucideType, 18);
const LinkGlyph = lucideGlyph(lucideLink, 18);

/** One suggestion under Link, in a group: `value` is what Link holds once it is taken. */
export type OfficeLinkOffer = { group: string; key: string; label: string; value: string };
/** A group of suggestions, listed in the order given, under its heading with its glyph. */
export type OfficeLinkGroup = { id: string; heading: string; glyph: ComponentType };

const FIELD =
  'h-field min-w-0 flex-1 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function OfficeLinkEditor({
  anchor,
  text: openText,
  href,
  groups,
  offers,
  onApply,
  onClose,
}: {
  anchor: Box;
  // The text the editor opens with; null where it keeps its text (no Text field).
  text: string | null;
  href: string;
  groups: readonly OfficeLinkGroup[];
  // The suggestions for what was typed into Link since it was last taken from.
  offers: (typed: string) => readonly OfficeLinkOffer[];
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
  // The groups in their order, one list to move through.
  const all = offers(typed);
  const offered = groups.flatMap((g) => all.filter((o) => o.group === g.id));
  const index = Math.min(chosen, Math.max(0, offered.length - 1));
  useClickOutside(box, onClose, true, OFFICE_POPUP);

  const take = (offer: OfficeLinkOffer) => {
    setLink(offer.value);
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
        data-office-link-editor
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="w-[26rem] max-w-[calc(100vw-1rem)] rounded-menu border border-(--office-line) bg-(--office-menu) p-3 text-body text-(--office-ink) shadow-lg"
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
            className="h-field shrink-0 rounded-control px-3 font-medium text-(--office-primary) hover:bg-(--office-menu-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          >
            Apply
          </button>
        </div>
        {problem !== null ? (
          <p
            id={`${id}-problem`}
            role="alert"
            className="mt-2 ml-7 text-supporting text-(--office-error)"
          >
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
            {groups.map(({ id: group, heading, glyph: Glyph }) => {
              const members = offered.filter((o) => o.group === group);
              if (members.length === 0) return null;
              return (
                <div key={group} role="group" aria-labelledby={`${listId}-${group}`}>
                  <div
                    id={`${listId}-${group}`}
                    role="presentation"
                    className="px-2 pt-1 pb-0.5 text-supporting text-(--office-muted)"
                  >
                    {heading}
                  </div>
                  {members.map((offer) => {
                    const at = offered.indexOf(offer);
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
                        className="flex h-row cursor-default items-center gap-2 rounded-control px-2 aria-selected:bg-(--office-menu-hover)"
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
