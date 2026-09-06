import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moii-8641e";

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const parsedAccount = typeof serviceAccountKey === "string" ? JSON.parse(serviceAccountKey) : serviceAccountKey;
      return initializeApp({
        credential: cert(parsedAccount),
        projectId,
      });
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, initializing default app:", e);
    }
  }

  return initializeApp({ projectId });
}

const adminApp = initFirebaseAdmin();
export const adminAuth = getAuth(adminApp);
