// The session read, started with the HTML (docs/specs/016-platform/web-performance.md "The open path asks in
// parallel"). An inline script at the top of every page's head asks for the session while the scripts download; the
// auth bridge's first read takes that request, and every later read asks itself. Free of browser code at import, so
// the root layout can inline the script.
import { authUrl } from '@livedoc/account-session';
import { API_BASE } from './api/base';

export const SESSION_READ_URL = authUrl(API_BASE, 'get-session');

// The workbench page is signed in by its workbench session, never by the browser's: the bridge stands down there
// (AuthBridge), so nothing is asked early either.
export const WORKBENCH_ROUTE = '/embed/workbench';

const EARLY_REQUEST = '__livedocSessionRead';

declare global {
  interface Window {
    [EARLY_REQUEST]?: Promise<Response>;
  }
}

// Dependency-free ES5 for an inline <script>, asking exactly what readSession asks (@livedoc/account-session). The
// side `catch` keeps a failed read from reading as an unhandled rejection before the bridge takes it; the bridge still
// sees the failure.
export const SESSION_READ_BOOT_SCRIPT = `try{if(location.pathname.indexOf(${JSON.stringify(WORKBENCH_ROUTE)})!==0){var p=fetch(${JSON.stringify(SESSION_READ_URL)},{cache:'no-store',credentials:'same-origin'});p.catch(function(){});window.${EARLY_REQUEST}=p}}catch(e){}`;

/** The fetch the auth bridge reads the session with: the boot script's request, taken once, else a new one. */
export const sessionReadFetch: typeof fetch = (input, init) => {
  if (input === SESSION_READ_URL) {
    const early = window[EARLY_REQUEST];
    window[EARLY_REQUEST] = undefined;
    if (early) return early;
  }
  return fetch(input, init);
};

export function resetBootSessionReadForTests(): void {
  window[EARLY_REQUEST] = undefined;
}
