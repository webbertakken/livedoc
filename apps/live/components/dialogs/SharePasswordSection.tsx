import { SHARE_PASSWORD_MIN } from '@livedoc/api-schema';
import { Button, LockIcon } from '@livedoc/ui';
import { useRef, useState } from 'react';
import { SettingsRow } from '@/components/dialogs/settings/SettingsRow';

// The share-password band (docs/specs/013-workspace/share-password.md): one optional password that gates every
// link. Owns its own field + "Saved" flash state; the busy flag is shared with
// the dialog's link actions (passed in) so a save and a link create can't race.
// Split out of ShareDialog.
//
// Fronted by a switch (docs/specs/007-editor/live-app.md "Layout, top to bottom"): off hides the
// field, on reveals it. With a password saved, switching off removes it, so
// the switch never disagrees with what the server enforces.
//
// The api keeps only a hash, so a saved password cannot be shown again: once
// one is set the field gives way to a "Password Set" line with Replace and
// Remove, and Replace brings back an empty field.
//
// A new password needs SHARE_PASSWORD_MIN characters after trimming (the api refuses fewer): until then Save waits
// and a hint under the field says so.
type SharePasswordSectionProps = {
  sharePasswordSet: boolean;
  // Resolves to whether a password is now set on success (`false` = cleared)
  // and `undefined` on FAILURE: the two must stay distinct or a failed write
  // renders the success UI (see useShareLinks).
  onSetPassword: (password: string | null) => Promise<boolean | undefined> | void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

// The nested detail under the switch: indented to the footnote's edge with a
// guide rule, so it reads as the switch's detail rather than a stray row.
const DETAIL_ROW =
  'ml-3.5 flex animate-fade-in items-center gap-2 border-l-2 border-slate-200 py-0.5 pl-3 dark:border-slate-700';

// The too-short hint, named by the field (aria-describedby) while it shows. One Share dialog is open at a time.
const HINT_ID = 'share-password-hint';

export function SharePasswordSection({
  sharePasswordSet,
  onSetPassword,
  busy,
  setBusy,
}: SharePasswordSectionProps) {
  // The new password being typed. Never seeded: the saved one is unknowable.
  const [pw, setPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  // The owner switched on with no password saved yet (the field is open). The
  // switch itself is on whenever a password is in force: deriving it, rather
  // than seeding state at mount, keeps it right when the dialog opens before
  // the share list has loaded.
  const [enabled, setEnabled] = useState(false);
  const switchOn = sharePasswordSet || enabled;
  // Replacing a saved password: the field is showing in place of "Password Set".
  const [replacing, setReplacing] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  const focusField = () => requestAnimationFrame(() => fieldRef.current?.focus());

  const savePassword = async () => {
    setBusy(true);
    try {
      const next = pw.trim() ? pw : null;
      const result = onSetPassword(next);
      // Sync (void) handlers (tests) count as success; a promise resolving to
      // `undefined` is a FAILED write (the hook already toasted), so leave the
      // field + button untouched rather than flashing "Saved" over a password
      // that isn't stored.
      const nowSet = result instanceof Promise ? await result : next !== null;
      if (nowSet === undefined) return;
      setPw('');
      setReplacing(false);
      // Saving an empty field clears the password, which is the switch off.
      if (!nowSet) setEnabled(false);
      setPwSaved(true);
      window.setTimeout(() => setPwSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  };

  const removePassword = async () => {
    setBusy(true);
    try {
      const result = onSetPassword(null);
      const nowSet = result instanceof Promise ? await result : false;
      // Failed remove: the password still gates every link, so keep showing it as set.
      if (nowSet === undefined) return;
      setPw('');
      setReplacing(false);
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    if (!switchOn) {
      setEnabled(true);
      // The field mounts on this render; focus it on the next frame.
      focusField();
      return;
    }
    if (sharePasswordSet) {
      void removePassword();
      return;
    }
    setEnabled(false);
    setPw('');
  };

  const startReplace = () => {
    setReplacing(true);
    focusField();
  };

  const cancelReplace = () => {
    setReplacing(false);
    setPw('');
  };

  const showSetLine = sharePasswordSet && !replacing;
  const typed = pw.trim();
  const tooShort = typed.length > 0 && typed.length < SHARE_PASSWORD_MIN;
  const canSave = !busy && typed.length > 0 && !tooShort;

  return (
    <div
      data-tour-id="share-password"
      className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"
    >
      {/* The Settings dialog's own toggle row, so the switch looks and
          behaves like every other setting in the app. */}
      <SettingsRow
        row={{
          key: 'share-password',
          label: 'Password Protection',
          description: 'Everyone opening a pass must enter it first, embeds included.',
          helpArticle: 'sharePasswords',
        }}
        checked={switchOn}
        onChange={toggle}
        disabled={busy}
      />
      {switchOn && showSetLine ? (
        <div className={DETAIL_ROW}>
          <p className="flex min-w-0 flex-1 items-center gap-2 text-body text-slate-700 dark:text-slate-200">
            <LockIcon size={13} className="shrink-0 text-slate-400" />
            {pwSaved ? 'Password Saved' : 'Password Set'}
          </p>
          <Button variant="secondary" size="xs" onClick={startReplace} disabled={busy}>
            Replace
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => void removePassword()}
            disabled={busy}
          >
            Remove
          </Button>
        </div>
      ) : null}
      {switchOn && !showSetLine ? (
        <div className={DETAIL_ROW}>
          <div className="flex h-field min-w-0 flex-1 items-center gap-2 rounded-control border border-slate-200 bg-white px-2 transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 dark:border-slate-700 dark:bg-slate-800">
            <LockIcon size={13} className="pointer-events-none shrink-0 text-slate-400" />
            <input
              ref={fieldRef}
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) void savePassword();
                if (e.key === 'Escape' && replacing) {
                  // Leave the dialog open: Escape here only backs out of Replace.
                  e.stopPropagation();
                  cancelReplace();
                }
              }}
              placeholder={replacing ? 'Choose a new password' : 'Choose a password'}
              aria-label="Share password"
              aria-describedby={tooShort ? HINT_ID : undefined}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-body text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400 dark:text-slate-100"
            />
          </div>
          <Button
            size="xs"
            onClick={() => void savePassword()}
            disabled={!canSave}
            className="shadow-sm"
          >
            Save
          </Button>
          {replacing ? (
            <Button variant="secondary" size="xs" onClick={cancelReplace} disabled={busy}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
      {switchOn && !showSetLine && tooShort ? (
        <p
          id={HINT_ID}
          className="ml-3.5 border-l-2 border-slate-200 pl-3 text-supporting text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          At least {SHARE_PASSWORD_MIN} characters.
        </p>
      ) : null}
    </div>
  );
}
