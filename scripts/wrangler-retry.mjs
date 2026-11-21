#!/usr/bin/env node
// Runs a deploy command, running it again when Cloudflare answers with a server error of its own
// (docs/specs/016-platform/deployment.md "Cloudflare's own errors are retried"). Any other failure,
// and the last server error, fails with the command's own exit status.
//
//   node ../../scripts/wrangler-retry.mjs pnpm exec wrangler deploy [args...]
//
// Output streams through as it comes; it is also kept to read the cause of a failure.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RETRY_WAITS_MS = [5000, 15000, 45000];

/** The cause of a Cloudflare server error in a failed command's output, or null for any other failure. */
export function cloudflareServerError(output) {
  const code = /\[code: (\d+)\]/.exec(output);
  if (code && Number(code[1]) >= 10500) return `code ${code[1]}`;
  const http = /\bstatus (5\d\d)\b/.exec(output);
  if (http) return `HTTP ${http[1]}`;
  return null;
}

/** run(), again after each wait while it fails on a Cloudflare server error; resolves to the final exit status. */
export async function runWithRetry({ run, waitsMs, sleep, log }) {
  for (const waitMs of [...waitsMs, null]) {
    const { status, output } = await run();
    if (status === 0) return 0;
    const cause = cloudflareServerError(output);
    if (cause === null || waitMs === null) return status;
    log(`[wrangler-retry] Cloudflare server error (${cause}); running again in ${waitMs / 1000} s`);
    await sleep(waitMs);
  }
  return 1;
}

function runOnce([command, ...args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      output += chunk;
    });
    child.on('error', (error) => resolve({ status: 1, output: String(error) }));
    child.on('close', (code) => resolve({ status: code ?? 1, output }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error('usage: wrangler-retry.mjs <command> [args...]');
    process.exit(2);
  }
  process.exitCode = await runWithRetry({
    run: () => runOnce(command),
    waitsMs: RETRY_WAITS_MS,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.error(line),
  });
}
