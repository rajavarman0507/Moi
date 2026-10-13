import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import crypto from "crypto";

// Fallback public Google STUN servers
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

export async function GET(req: NextRequest) {
  // 1. Verify caller Firebase ID Token
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
  }

  let verifiedUid: string;
  try {
    const verified = await verifyFirebaseIdToken(idToken);
    verifiedUid = verified.uid;
  } catch (authErr: any) {
    return NextResponse.json(
      { error: "Unauthorized: Token verification failed", message: authErr?.message },
      { status: 401 }
    );
  }

  // 2. Build ICE servers list based on environment variables
  const turnUrlsRaw = process.env.TURN_SERVER_URLS; // e.g. "turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp"
  const turnSecret = process.env.TURN_SECRET; // HMAC shared secret for ephemeral creds (RFC 5766 / coturn style)
  const turnStaticUsername = process.env.TURN_USERNAME;
  const turnStaticCredential = process.env.TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [...DEFAULT_STUN_SERVERS];

  if (!turnUrlsRaw) {
    // No TURN configured in environment: log warning on server, return STUN-only
    console.warn("[TURN API] No TURN_SERVER_URLS configured in environment variables. Falling back to STUN only.");
    return NextResponse.json({
      iceServers,
      mode: "stun-only",
      warning: "TURN is not configured on this deployment. Direct P2P or STUN will be used.",
    });
  }

  const turnUrls = turnUrlsRaw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (turnSecret) {
    // Generate short-lived HMAC credentials (valid for 12 hours)
    const expiry = Math.floor(Date.now() / 1000) + 12 * 3600;
    const ephemeralUsername = `${expiry}:${verifiedUid}`;
    const hmac = crypto.createHmac("sha1", turnSecret);
    hmac.update(ephemeralUsername);
    const ephemeralPassword = hmac.digest("base64");

    iceServers.push({
      urls: turnUrls,
      username: ephemeralUsername,
      credential: ephemeralPassword,
    });

    return NextResponse.json({
      iceServers,
      mode: "turn-ephemeral",
    });
  } else if (turnStaticUsername && turnStaticCredential) {
    // Static credentials configured
    iceServers.push({
      urls: turnUrls,
      username: turnStaticUsername,
      credential: turnStaticCredential,
    });

    return NextResponse.json({
      iceServers,
      mode: "turn-static",
    });
  } else {
    // TURN URLs present but missing credentials
    console.warn("[TURN API] TURN_SERVER_URLS provided but missing TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL.");
    return NextResponse.json({
      iceServers,
      mode: "stun-only",
      warning: "TURN servers defined but credentials missing.",
    });
  }
}
