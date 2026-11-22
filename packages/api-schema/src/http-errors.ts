// Reading the api worker's failures in the browser (docs/specs/015-api/api.md "Errors"), shared by the editor's
// client and the public sites'.

// The worker's `error` token from a failed response body, without disturbing the caller's own `res.json()` (it
// reads a clone). Tolerant of empty or non-JSON bodies (a 503 from a missing binding, a network-level failure):
// null rather than a second error on top of the first.
export async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

// A fetch cancelled on purpose (its AbortController fired: the filters changed, the page went), which callers drop
// silently rather than report as a failure.
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

// The `error` tokens of a 503 that says this deployment has not configured a feature (docs/specs/015-api/api.md,
// docs/specs/017-telemetry/telemetry.md): the api answers them from here, and the editor's error telemetry never
// counts them, because a feature switched off is not a fault. A 503 that is the server failing to serve
// (`storage_unavailable`, `content_moving`, `room_unavailable`) never belongs here.
export const FEATURE_OFF_ERROR = {
  // No AI provider for the feature (apps/api/src/routes/ai-gate.ts).
  ai: 'ai_not_configured',
  // No R2 bucket bound for images (apps/api/src/responses.ts imagesUnavailable).
  images: 'images_unavailable',
} as const;

export type FeatureOffError = (typeof FEATURE_OFF_ERROR)[keyof typeof FEATURE_OFF_ERROR];

export const FEATURE_OFF_ERRORS: readonly FeatureOffError[] = Object.values(FEATURE_OFF_ERROR);

/** A 503 whose token says the deployment switched the feature off, rather than failed to serve it. */
export function isFeatureOff(status: number, code: string | null): boolean {
  return status === 503 && (FEATURE_OFF_ERRORS as readonly string[]).includes(code ?? '');
}
