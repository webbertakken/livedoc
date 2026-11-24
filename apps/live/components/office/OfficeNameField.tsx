'use client';

// The document's name in the office title row (docs/specs/034-text-documents/editing-surface.md "The title row"): a
// field that reads as text until hovered or focused. Enter or blur renames, Escape puts the name back, an empty name
// is refused. The name stays the page's level-one heading, read once by a screen reader's heading list.
import { useEffect, useRef, useState } from 'react';

export const OFFICE_NAME_EMPTY = 'Give the document a name';

const TEXT = 'text-name leading-[26px] text-(--office-ink)';

export function OfficeNameField({
  name,
  onRename,
  focusNonce,
}: {
  name: string;
  // Null for a session that may not rename the document.
  onRename: ((next: string) => void) | null;
  // Each change puts the focus in the field with the name selected (File > Rename).
  focusNonce: number;
}) {
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const [refused, setRefused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Escape and Enter settle the field before the blur that follows them; the blur then has nothing to do.
  const settled = useRef(false);

  // A rename from elsewhere (a collaborator, the tab list) shows unless the person is typing one.
  const [seen, setSeen] = useState(name);
  if (name !== seen) {
    setSeen(name);
    if (!editing) setDraft(name);
  }

  // Each request is honoured once; the value at mount is never a request.
  const handledNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce === handledNonce.current) return;
    handledNonce.current = focusNonce;
    input.current?.focus();
    input.current?.select();
  }, [focusNonce]);

  if (!onRename)
    return (
      <h1 data-office-name="" className={`min-w-0 truncate px-2 ${TEXT}`}>
        {name}
      </h1>
    );

  const putBack = () => {
    setDraft(name);
    setEditing(false);
  };
  const commit = () => {
    const next = draft.trim();
    if (next === '') {
      setRefused(true);
      putBack();
      return;
    }
    setEditing(false);
    if (next !== name) onRename(next);
    else setDraft(name);
  };

  return (
    <div className="relative min-w-0">
      <h1 className="sr-only">{name}</h1>
      {/* The field's width is its text's: a hidden twin in the same grid cell sizes it. */}
      <span className="grid min-w-0">
        <span
          aria-hidden
          className={`invisible col-start-1 row-start-1 whitespace-pre border border-transparent pr-2 pl-2 ${TEXT}`}
        >
          {draft || ' '}
        </span>
        <input
          ref={input}
          data-office-name=""
          aria-label="Rename"
          value={draft}
          spellCheck={false}
          // The hidden twin sets the width; an input's own default (20 characters) would hold it open.
          size={1}
          onFocus={() => {
            settled.current = false;
            setEditing(true);
            setRefused(false);
          }}
          onChange={(e) => {
            setEditing(true);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              settled.current = true;
              commit();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              settled.current = true;
              putBack();
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (settled.current) return;
            settled.current = true;
            commit();
          }}
          className={`col-start-1 row-start-1 w-full min-w-0 truncate rounded-control border border-transparent bg-transparent px-2 outline-none pointer-coarse:-my-2 pointer-coarse:py-2 hover:border-(--office-line) focus:border-(--office-focus) focus:ring-1 focus:ring-(--office-focus) ${TEXT}`}
        />
      </span>
      {refused ? (
        <p
          role="alert"
          className="absolute top-full left-0 z-10 mt-1 whitespace-nowrap rounded-control bg-(--office-menu) px-2 py-1 text-body text-(--office-ink) shadow"
        >
          {OFFICE_NAME_EMPTY}
        </p>
      ) : null}
    </div>
  );
}
