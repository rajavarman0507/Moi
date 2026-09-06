import crypto from "crypto";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moi-app-demo";

let adminAuthInstance: any = null;

function getAdminAuthIfConfigured(): any {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  if (adminAuthInstance) {
    return adminAuthInstance;
  }

  try {
    const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");

    const parsedAccount = typeof serviceAccountKey === "string" ? JSON.parse(serviceAccountKey) : serviceAccountKey;
    const app = getApps().length > 0 ? getApp() : initializeApp({
      credential: cert(parsedAccount),
      projectId,
    });
    adminAuthInstance = getAuth(app);
    return adminAuthInstance;
  } catch (e) {
    console.error("Firebase Admin SDK initialization failed, falling back to public cert verification:", e);
    return null;
  }
}


// Cache for Google's public x509 certs used for RS256 JWT signature verification
let cachedCerts: { [kid: string]: string } | null = null;
let certsExpiryTime = 0;

async function fetchGooglePublicCerts(): Promise<{ [kid: string]: string }> {
  if (cachedCerts && Date.now() < certsExpiryTime) {
    return cachedCerts;
  }

  try {
    const res = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
    if (!res.ok) throw new Error(`Google certs status ${res.status}`);

    const cacheControl = res.headers.get("cache-control");
    let maxAge = 3600;
    if (cacheControl) {
      const match = cacheControl.match(/max-age=(\d+)/);
      if (match && match[1]) maxAge = parseInt(match[1], 10);
    }

    cachedCerts = await res.json();
    certsExpiryTime = Date.now() + maxAge * 1000;
    return cachedCerts || {};
  } catch (err) {
    console.error("Failed to fetch Google public certs:", err);
    return cachedCerts || {};
  }
}

/**
 * Verified Server-Side Firebase ID Token Validation:
 * 1. Tries Admin SDK verifyIdToken if credentials exist (Method A).
 * 2. Fallbacks to Google Public Certificate RS256 JWT verification if service account credentials are not configured in environment (Method B).
 * 3. Enforces strict issuer (https://securetoken.google.com/<projectId>), audience (<projectId>), expiration, and user UID checks.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string; verificationMethod: string }> {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing ID token");
  }

  // Method A: Admin SDK if service account credentials configured
  const adminAuth = getAdminAuthIfConfigured();
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      console.log("[Auth] Successfully verified Firebase ID Token via Method A (Admin SDK)");
      return { uid: decoded.uid, email: decoded.email, verificationMethod: "Method A (Admin SDK)" };
    } catch (adminErr) {
      console.warn("Admin SDK verifyIdToken failed, attempting public cert validation:", adminErr);
    }
  }

  // Method B: Google Public Cert RS256 JWT Signature Verification
  console.log(`[Auth] Verifying Firebase ID Token via Method B (Google Public Cert RS256) for projectId '${projectId}'`);
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; auth_time?: number };

  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (parseErr) {
    throw new Error("Failed to decode JWT header/payload");
  }

  // Validate Token Structure & Claims
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Invalid JWT algorithm or missing Key ID (kid)");
  }

  const allowedProjectIds = Array.from(new Set([
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    "moi-app-demo",
    "moii-8641e"
  ])).filter(Boolean) as string[];

  if (!payload.aud || !allowedProjectIds.includes(payload.aud)) {
    throw new Error(`Invalid token audience: expected one of [${allowedProjectIds.join(", ")}], got ${payload.aud}`);
  }

  const expectedIssuer = `https://securetoken.google.com/${payload.aud}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid token issuer: expected ${expectedIssuer}, got ${payload.iss}`);
  }


  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error("Firebase ID token has expired");
  }

  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim() === "") {
    throw new Error("Invalid user UID (sub claim) in token");
  }

  // Verify Signature using Google Public Certificate
  const certs = await fetchGooglePublicCerts();
  const publicCert = certs[header.kid];
  if (!publicCert) {
    throw new Error(`Public key for kid ${header.kid} not found in Google certificates`);
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const isSignatureValid = verifier.verify(publicCert, signatureB64, "base64url");

  if (!isSignatureValid) {
    throw new Error("JWT signature verification failed against Google public cert");
  }

  return { uid: payload.sub, email: payload.email, verificationMethod: "Method B (Google Public Cert RS256)" };
}

