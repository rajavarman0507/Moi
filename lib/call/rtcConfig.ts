// WebRTC RTCConfiguration and ICE fetcher

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 2,
};

export let lastTurnHttpStatus: string = "unfetched";

export function getLastTurnHttpStatus(): string {
  return lastTurnHttpStatus;
}

/**
 * Fetch authenticated ICE servers (STUN + TURN) from our secure API endpoint.
 * Falls back to default STUN servers if fetch fails or user is unauthenticated.
 * Enforces a strict 3-second AbortController timeout so call setup never stalls.
 */
export async function fetchRtcConfig(getIdToken?: () => Promise<string>): Promise<RTCConfiguration> {
  if (!getIdToken) {
    lastTurnHttpStatus = "no-auth";
    return DEFAULT_RTC_CONFIG;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const token = await getIdToken();
    if (!token) {
      clearTimeout(timeoutId);
      lastTurnHttpStatus = "no-token";
      return DEFAULT_RTC_CONFIG;
    }

    const res = await fetch("/api/turn", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    lastTurnHttpStatus = `${res.status}`;

    if (!res.ok) {
      console.warn(`[ICE Config] Failed to fetch /api/turn (${res.status}), using default STUN.`);
      return DEFAULT_RTC_CONFIG;
    }

    const data = await res.json();
    if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      return {
        iceServers: data.iceServers,
        iceCandidatePoolSize: 2,
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      lastTurnHttpStatus = "timeout (3s)";
    } else {
      lastTurnHttpStatus = `error (${err?.name || "fetch"})`;
    }
    console.warn("[ICE Config] Error fetching TURN configuration:", err);
  }

  return DEFAULT_RTC_CONFIG;
}
