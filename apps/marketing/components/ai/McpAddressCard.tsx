import { MCP_URL } from '@/lib/ai-clients';

import { CopyButton } from './CopyButton';

// The one thing every AI tool needs (docs/specs/019-marketing/build-with-ai.md "The page" 1): the MCP address
// in a monospace field with a brand Copy button.
export function McpAddressCard() {
  return (
    <div className="w-full max-w-xl">
      <p className="text-body text-slate-600 dark:text-slate-300">
        Your AI tool needs one address:
      </p>
      <div className="mt-2 flex items-center gap-2 rounded-surface border border-slate-200 bg-white p-2 pl-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Read in order after the line above it: a <code> takes no name of its own. */}
        <code className="min-w-0 flex-1 font-mono text-supporting break-all text-slate-900 select-all min-[400px]:text-body sm:text-panel-title dark:text-slate-100">
          {MCP_URL}
        </code>
        <CopyButton text={MCP_URL} what="the address" tone="brand" />
      </div>
    </div>
  );
}
