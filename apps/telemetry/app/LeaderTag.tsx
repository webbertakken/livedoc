import type { ReactNode } from 'react';

// The green pill on a list's leading row ("Most used", "Most documents"). Emerald-700 on emerald-50 reads at
// WCAG AA (about 5.5:1) at its 10px size; emerald-600 fell short (3.5:1).
export function LeaderTag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-supporting text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
      {children}
    </span>
  );
}
