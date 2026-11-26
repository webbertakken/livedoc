'use client';

// Manage stamps (docs/specs/035-pdf-documents/custom-stamps.md "Managing them"): the shell's dialog listing a person's
// custom stamps a category each, in the grid's order. A category's name and a stamp's name are fields, kept once left;
// a stamp moves by its Category list (New category… asks for one in place); Delete asks in place first. Each change is
// manage-custom-stamps.ts', LiveDoc's at once; one that fails is said here and the list read again.
import { useState, type FocusEvent, type KeyboardEvent } from 'react';

import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
  type CustomStampRecord,
} from '@livedoc/pdf-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { customStampSections } from '@/lib/pdf-document/custom-stamps';
import {
  deleteCustomStamp,
  deleteCustomStampCategory,
  moveCustomStamp,
  renameCustomStamp,
  renameCustomStampCategory,
  type StampChanged,
} from '@/lib/pdf-document/manage-custom-stamps';
import type { ManageStampsDialogProps } from '@/lib/pdf-document/usePdfCustomStamps';

/** A field asked for in place takes the caret as it appears; stable, so it is focused once. */
const focusField = (field: HTMLInputElement | null) => field?.focus({ preventScroll: true });

/** The Category list's entry that asks for a new one. */
const NEW_CATEGORY = '\u0000new';

const FIELD =
  'h-field min-w-0 flex-1 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) pointer-coarse:h-11 pointer-coarse:text-base';

const BUTTON =
  'h-field shrink-0 rounded-control px-2 text-body text-(--office-ink) outline-none hover:bg-(--office-menu-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) pointer-coarse:h-11';

type Asking = { kind: 'stamp'; id: string } | { kind: 'category'; name: string } | null;

/** A field kept once left: Enter leaves it, Escape puts back what it held. */
function keptField(was: string, keep: (text: string) => void) {
  return {
    defaultValue: was,
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const text = e.currentTarget.value;
      // A field left empty goes back to what it was.
      if (text.trim() === '') e.currentTarget.value = was;
      else if (text !== was) keep(text);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape' && e.currentTarget.value !== was) {
        e.stopPropagation();
        e.currentTarget.value = was;
      }
    },
  };
}

export function ManageStampsDialog({
  open,
  ownerId,
  stamps,
  pictures,
  onClose,
  onCreate,
}: ManageStampsDialogProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const sections = customStampSections(stamps);
  const categories = sections.map((section) => section.category);
  const said = (done: Promise<StampChanged>) =>
    void done.then((result) => setProblem(result.ok ? null : result.problem));

  const ask = (body: string, onDelete: () => void) => (
    <div role="group" aria-label={body} className="flex flex-wrap items-center gap-2 py-1">
      <span className="min-w-0 flex-1 text-body">{body}</span>
      <button
        type="button"
        className={`${BUTTON} text-(--office-error)`}
        onClick={() => {
          setAsking(null);
          onDelete();
        }}
      >
        Delete
      </button>
      <button type="button" className={BUTTON} onClick={() => setAsking(null)}>
        Cancel
      </button>
    </div>
  );

  const row = (stamp: CustomStampRecord) => {
    if (asking?.kind === 'stamp' && asking.id === stamp.id)
      return (
        <li key={stamp.id}>
          {ask(`Delete ${stamp.name}? Stamps already placed stay.`, () =>
            said(deleteCustomStamp(ownerId, stamp)),
          )}
        </li>
      );
    const src = pictures.get(stamp.picture.key);
    return (
      <li key={stamp.id} data-custom-stamp-row={stamp.id} className="flex items-center gap-2">
        <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-control bg-(--pdf-paper) p-0.5">
          {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </span>
        <input
          key={`${stamp.id}-${stamp.name}`}
          type="text"
          aria-label={`Name of ${stamp.name}`}
          maxLength={PDF_CUSTOM_STAMP_NAME_MAX_CHARS}
          className={FIELD}
          {...keptField(stamp.name, (text) => said(renameCustomStamp(ownerId, stamp, text)))}
        />
        {naming === stamp.id ? (
          <input
            type="text"
            aria-label={`New category for ${stamp.name}`}
            placeholder="New category"
            maxLength={PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS}
            // Asked for in place, so the caret is already there.
            ref={focusField}
            className={`${FIELD} max-w-36`}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== 'Escape') return;
              e.preventDefault();
              e.stopPropagation();
              if (e.key === 'Escape') e.currentTarget.value = '';
              e.currentTarget.blur();
            }}
            onBlur={(e) => {
              setNaming(null);
              if (e.currentTarget.value.trim() !== '')
                said(moveCustomStamp(ownerId, stamp, e.currentTarget.value));
            }}
          />
        ) : (
          <select
            aria-label={`Category of ${stamp.name}`}
            value={stamp.category}
            onChange={(e) => {
              if (e.target.value === NEW_CATEGORY) setNaming(stamp.id);
              else said(moveCustomStamp(ownerId, stamp, e.target.value));
            }}
            className={`${FIELD} max-w-36`}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            <option value={NEW_CATEGORY}>New category…</option>
          </select>
        )}
        <button
          type="button"
          aria-label={`Delete ${stamp.name}`}
          className={BUTTON}
          onClick={() => setAsking({ kind: 'stamp', id: stamp.id })}
        >
          Delete
        </button>
      </li>
    );
  };

  return (
    <OfficeDialog open={open} onClose={onClose} title="Manage stamps" wide>
      <div className="flex flex-col gap-6">
        {sections.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body">You have no custom stamps yet.</p>
            <button
              type="button"
              className={`${BUTTON} border border-(--office-line)`}
              onClick={onCreate}
            >
              Create custom stamp…
            </button>
          </div>
        ) : null}
        {sections.map(({ category, stamps: inIt }) => (
          <section key={category} aria-label={category} className="flex flex-col gap-2">
            {asking?.kind === 'category' && asking.name === category ? (
              ask(`Delete ${category} and its ${inIt.length} stamps?`, () =>
                said(deleteCustomStampCategory(ownerId, category, inIt.length)),
              )
            ) : (
              <div className="flex items-center gap-2">
                <input
                  key={category}
                  type="text"
                  aria-label={`Category ${category}`}
                  maxLength={PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS}
                  className={`${FIELD}`}
                  {...keptField(category, (text) =>
                    said(renameCustomStampCategory(ownerId, category, text)),
                  )}
                />
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => setAsking({ kind: 'category', name: category })}
                >
                  Delete category
                </button>
              </div>
            )}
            <ul className="flex flex-col gap-2 pl-2">{inIt.map(row)}</ul>
          </section>
        ))}
        {problem ? (
          <p role="alert" className="text-body text-(--office-error)">
            {problem}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
