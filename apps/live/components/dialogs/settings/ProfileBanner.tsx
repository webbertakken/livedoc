import { identityVars } from '@livedoc/ui';

// The profile card's banner (docs/specs/014-identity/profile-and-email-notifications.md "Identity"): a dotted canvas
// in the brand's tint, two faint cards joined by a line, a collaborator's cursor faint in the corner, and the
// person's own cursor with their name tag in their presence colour, as others see it. Decorative: the card says the
// same in words. Before the colour is known, the cursor and tag are drawn in a neutral grey, the same size, so
// nothing moves when it lands.
const NEUTRAL = '#94a3b8';

export function ProfileBanner({ name, colour }: { name: string; colour: string | null }) {
  return (
    <div
      aria-hidden="true"
      data-profile-banner=""
      style={identityVars(colour ?? NEUTRAL)}
      className="relative h-28 overflow-hidden rounded-t-[inherit] bg-gradient-to-br from-brand-50 via-white to-brand-100 dark:from-slate-900 dark:via-slate-900 dark:to-brand-500/25"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgb(100_116_139/0.28)_1px,transparent_1px)] bg-[length:14px_14px] dark:bg-[radial-gradient(circle,rgb(148_163_184/0.18)_1px,transparent_1px)]" />
      <svg
        viewBox="0 0 480 112"
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <g className="text-brand-300 dark:text-brand-500/50">
          <rect
            x="250"
            y="22"
            width="78"
            height="40"
            rx="8"
            className="fill-white dark:fill-slate-800"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="262" y="34" width="44" height="5" rx="2.5" fill="currentColor" opacity="0.7" />
          <rect x="262" y="45" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.45" />
          <rect
            x="374"
            y="58"
            width="78"
            height="40"
            rx="8"
            className="fill-white dark:fill-slate-800"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="386" y="70" width="40" height="5" rx="2.5" fill="currentColor" opacity="0.7" />
          <rect x="386" y="81" width="52" height="5" rx="2.5" fill="currentColor" opacity="0.45" />
          <path
            d="M328 42c26 0 22 36 46 36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </g>
        <path
          d="M440 14l10 4.8-4.5 1.2-2.2 4.6z"
          className="fill-slate-400/70 dark:fill-slate-500/70"
        />
      </svg>
      <div data-profile-cursor="" className="absolute top-7 right-[15rem] flex items-start">
        <svg viewBox="0 0 16 16" className="size-icon-title drop-shadow-sm">
          <path
            d="M2 1.5 14 7.2l-5.4 1.4L6 14z"
            className="fill-(--identity) stroke-white dark:fill-(--identity-deep) dark:stroke-slate-900"
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        </svg>
        <span className="mt-4 -ml-1 inline-flex h-chip max-w-40 items-center rounded-full bg-(--identity) px-2 text-supporting text-white shadow-sm dark:bg-(--identity-deep)">
          <span className="text-optical-centre min-w-0 truncate">{name}</span>
        </span>
      </div>
    </div>
  );
}
