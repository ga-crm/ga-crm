const MINUTE_MS = 60_000;

/**
 * The per-account sign-in limit (USER-16, LoginGuardService) counts in windows aligned to the
 * clock minute. A test that makes several attempts and expects the last to be refused fails when
 * a minute ends between them, because the new window starts again from zero; CI hit this once.
 * Call this right before such a run: when less than `needMs` is left in the current minute, it
 * waits for the next one, so the whole run lands in one window.
 */
export async function withinOneMinuteWindow(needMs = 10_000): Promise<void> {
  const left = MINUTE_MS - (Date.now() % MINUTE_MS);
  if (left >= needMs) return;
  await new Promise((resolve) => setTimeout(resolve, left + 50));
}
