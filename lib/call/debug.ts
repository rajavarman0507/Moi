// Call-scoped logging helpers.
//
// Production builds must never log SDP, ICE credentials, tokens or user data, so
// verbose logs are development-only and production errors are reduced to a short
// message plus the error *name* (never the error object / message, which can
// contain candidate strings or SDP fragments).

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * The stats/debug overlay is shown in development, or in a production build when
 * NEXT_PUBLIC_CALL_DEBUG=1 is set at build time (e.g. on a Vercel Preview
 * deployment for two-device testing). It only displays aggregate stats
 * (resolution, fps, bitrate, loss, RTT, candidate type) — never SDP or credentials.
 */
export const CALL_DEBUG_ENABLED = IS_DEV || process.env.NEXT_PUBLIC_CALL_DEBUG === "1";

export function devLog(...args: unknown[]): void {
  if (IS_DEV) console.log("[call]", ...args);
}

export function callWarn(message: string, err?: unknown): void {
  if (IS_DEV) {
    console.warn(`[call] ${message}`, err ?? "");
  } else {
    console.warn(`[call] ${message}${errName(err)}`);
  }
}

export function callError(message: string, err?: unknown): void {
  if (IS_DEV) {
    console.error(`[call] ${message}`, err ?? "");
  } else {
    console.error(`[call] ${message}${errName(err)}`);
  }
}

function errName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === "string" && name ? ` (${name})` : "";
}
