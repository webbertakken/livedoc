'use client';

// The form's cog (docs/specs/030-forms/forms.md "Responses Go To and Settings"), at the end of the status bar as a
// board's settings sit at the end of its header: one panel switching between Responses Go To (first) and Settings, or
// opened on the one asked for (a paused form's Fix opens Responses Go To). An Editor's alone.
import { useState } from 'react';
import type { Tab } from '@livedoc/document';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import { lucideSettings } from '@livedoc/icons/lucide';
import type { FormLinkState } from '@/hooks/forms/useFormLink';
import { DestinationPicker } from './DestinationPicker';
import { FormSettingsTab } from './FormSettingsTab';
import { FormSheet } from './FormSheet';
import { requestFormTourRelaunch } from '@/lib/form-tour';

const CogIcon = lucideGlyph(lucideSettings, 16);

export type FormSettingsSection = 'destination' | 'settings';

export function FormSettingsButton({
  tabs,
  link,
  open,
  onOpen,
  onClose,
}: {
  tabs: readonly Tab[];
  link: FormLinkState;
  // The section opened with it (null: both closed), or false while the cog is shut.
  open: FormSettingsSection | null | false;
  onOpen: (section: FormSettingsSection | null) => void;
  onClose: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <Tooltip label="Form Settings">
        <button
          ref={setAnchor}
          type="button"
          aria-label="Form Settings"
          aria-haspopup="dialog"
          aria-expanded={open !== false}
          data-dock-button
          onClick={() => (open === false ? onOpen(null) : onClose())}
          className="flex size-field shrink-0 cursor-pointer items-center justify-center rounded-control text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <CogIcon aria-hidden />
        </button>
      </Tooltip>
      {open !== false && anchor ? (
        <FormSheet anchor={anchor} name="Form Settings" width={320} onClose={onClose}>
          <Sections tabs={tabs} link={link} first={open} onLeave={onClose} />
          {/* The Forms tour, again (docs/specs/030-forms/forms.md "The Forms tour"). */}
          <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                requestFormTourRelaunch();
              }}
              className="h-row cursor-pointer rounded-control px-2 text-body text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
            >
              Show Me Around
            </button>
          </div>
        </FormSheet>
      ) : null}
    </>
  );
}

function Sections({
  tabs,
  link,
  first,
  onLeave,
}: {
  tabs: readonly Tab[];
  link: FormLinkState;
  first: FormSettingsSection | null;
  // Closes the panel, for a choice that opens something of its own (the card type's editor).
  onLeave: () => void;
}) {
  const [shown, setShown] = useState<FormSettingsSection>(first ?? 'destination');
  const tab = (id: FormSettingsSection, name: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={shown === id}
      onClick={() => setShown(id)}
      className={`flex h-row flex-1 cursor-pointer items-center justify-center rounded-control px-2 text-body transition ${
        shown === id
          ? 'bg-white font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      {name}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Form Settings"
        className="flex gap-0.5 rounded-menu bg-slate-100 p-0.5 dark:bg-slate-800"
      >
        {tab('destination', 'Responses Go To')}
        {tab('settings', 'Settings')}
      </div>
      <div role="tabpanel" aria-label={shown === 'destination' ? 'Responses Go To' : 'Settings'}>
        {shown === 'destination' ? (
          <DestinationPicker tabs={tabs} onLeave={onLeave} />
        ) : (
          <FormSettingsTab link={link} />
        )}
      </div>
    </div>
  );
}
