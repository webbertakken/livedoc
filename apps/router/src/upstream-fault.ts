// docs/specs/016-platform/router-app.md "When a service answers 5xx".

/** The downstream apps the router forwards to, by the name its log lines use. */
export type Service = 'marketing' | 'live' | 'api' | 'telemetry' | 'help';

const FIRST_SERVER_ERROR_STATUS = 500;

/**
 * Records which service gave a `5xx` answer, then hands that answer back untouched.
 * A warning, not an error: the `5xx` itself already opens a Worker issue.
 */
export function noteUpstreamFault(
  service: Service,
  request: Request,
  response: Response,
): Response {
  if (response.status >= FIRST_SERVER_ERROR_STATUS) {
    console.warn(`[router] upstream fault service=${service} status=${response.status}`, {
      method: request.method,
    });
  }
  return response;
}
