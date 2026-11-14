// The dashboard's one api read, started with its HTML (docs/specs/016-platform/web-performance.md "Delivery").
// An inline script at the top of the page's markup asks for the summary while the scripts download; the dashboard
// takes that request once it runs, and asks itself only where the script did not run.

// Same origin as the editor + api under the router (docs.nu). An origin-relative '/api' is correct even though this
// app is served under '/telemetry' (basePath doesn't rewrite absolute fetch paths).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
export const SUMMARY_URL = `${API_BASE}/telemetry/summary`;

const EARLY_REQUEST = '__livedocTelemetrySummary';

declare global {
  interface Window {
    [EARLY_REQUEST]?: Promise<Response>;
  }
}

// Dependency-free ES5 for an inline <script>. The side `catch` keeps a failed request from reading as an unhandled
// rejection before the dashboard takes it; the dashboard still sees the failure.
export const SUMMARY_BOOT_SCRIPT = `try{var p=fetch(${JSON.stringify(SUMMARY_URL)});p.catch(function(){});window.${EARLY_REQUEST}=p}catch(e){}`;

/** The summary's response: the request the boot script made, taken once, or a new one. */
export function requestSummary(): Promise<Response> {
  const early = window[EARLY_REQUEST];
  window[EARLY_REQUEST] = undefined;
  return early ?? fetch(SUMMARY_URL);
}
