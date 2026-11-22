// The server-capability probe (docs/specs/007-editor/ai-assistance.md "Capabilities"): what this deployment offers
// (AI, email, the Drive mirror). Apart from the AI requests in ai.ts, which validate elements and so carry the
// document model: every route asks this, and only the editor asks those.
import type { CapabilitiesResponse } from '@livedoc/api-schema';
import { API_BASE, apiFetch } from './core';
import { reportServerError } from './error-report';

// Fetch server capabilities. Returns everything fail-closed (false) on any
// network error so callers degrade gracefully.
//
// Fetched once per page: the answer is deployment config, the same for every
// caller, and the editor, the Drive mirror and each Settings open all ask.
// A failed answer is not kept, so the next caller asks again.
let capabilities: Promise<CapabilitiesResponse> | null = null;

export function apiGetCapabilities(): Promise<CapabilitiesResponse> {
  capabilities ??= fetchCapabilities().then(({ caps, ok }) => {
    if (!ok) capabilities = null;
    return caps;
  });
  return capabilities;
}

// Tests only: a fresh page.
export function resetCapabilitiesForTests(): void {
  capabilities = null;
}

async function fetchCapabilities(): Promise<{ caps: CapabilitiesResponse; ok: boolean }> {
  const closed = { aiEnabled: false, emailEnabled: false };
  try {
    const res = await apiFetch(`${API_BASE}/capabilities`);
    await reportServerError(res, 'read capabilities');
    if (!res.ok) return { caps: closed, ok: false };
    return { caps: (await res.json()) as CapabilitiesResponse, ok: true };
  } catch {
    return { caps: closed, ok: false };
  }
}
