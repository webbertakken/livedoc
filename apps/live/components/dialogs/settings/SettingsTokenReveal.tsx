'use client';

// The one-time reveal (docs/specs/015-api/public-api-and-tokens.md#36-management--the-settings-dialogs-api-tokens-category).
// A credential card in the current theme: an emerald-edged "done" card with
// the secret in a monospace field, copied from inside the field.
import { useState } from 'react';
import { API_TOKEN_PREFIX } from '@livedoc/api-schema';
import { Button, CheckIcon, CopyIcon, Tooltip, useCopiedFlash } from '@livedoc/ui';

export function SettingsTokenReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  // Outlives each 1.5s "Copied" flash: once the secret is safe, Done leads.
  const [secretCopied, setSecretCopied] = useState(false);
  const hasPrefix = secret.startsWith(API_TOKEN_PREFIX);

  return (
    <div
      role="status"
      aria-label="New token created"
      className="flex flex-col gap-3 rounded-surface border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-3 text-slate-800 shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-icon-title items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950">
          <CheckIcon />
        </span>
        <span className="text-body">Token Created</span>
        <span className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-2 text-supporting text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
          Shown Once
        </span>
      </div>

      <CopyField label="Copy token" onCopied={() => setSecretCopied(true)} value={secret}>
        {hasPrefix ? (
          <>
            <span className="text-emerald-600 dark:text-emerald-400">{API_TOKEN_PREFIX}</span>
            {secret.slice(API_TOKEN_PREFIX.length)}
          </>
        ) : (
          secret
        )}
      </CopyField>

      <div className="flex items-center justify-between gap-3">
        <p className="text-supporting text-slate-500 dark:text-slate-400">
          Store it somewhere safe. We keep only a fingerprint, so it can&apos;t be shown again.
        </p>
        <Button
          size="xs"
          variant={secretCopied ? 'primary' : 'secondary'}
          onClick={onDone}
          className="shrink-0"
        >
          Done
        </Button>
      </div>
    </div>
  );
}

// A value with its copy button inside the field's right edge, the way the
// Share dialog's pass link does it: the field IS the thing being copied, so
// the action lives in it. "Copied" only once the clipboard write resolves, so
// a blocked clipboard never claims success.
function CopyField({
  value,
  label,
  onCopied,
  children,
}: {
  value: string;
  label: string;
  onCopied?: () => void;
  children: React.ReactNode;
}) {
  const { copied, flash } = useCopiedFlash(1500);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        flash();
        onCopied?.();
      })
      .catch(() => {});
  };
  return (
    <div className="flex items-center gap-1 rounded-control border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 dark:border-slate-700 dark:bg-slate-900/60">
      <code className="min-w-0 flex-1 select-all break-all font-mono text-supporting text-slate-700 dark:text-slate-200">
        {children}
      </code>
      <Tooltip label={copied ? 'Copied' : label}>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : label}
          className={`flex size-row shrink-0 items-center justify-center rounded-control transition ${
            copied
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 hover:bg-slate-200/70 hover:text-brand-700 dark:hover:bg-slate-700 dark:hover:text-brand-300'
          }`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </Tooltip>
    </div>
  );
}
