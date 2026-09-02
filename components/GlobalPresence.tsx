"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, getRtdb } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, onValue, push, onDisconnect, set } from "firebase/database";

export default function GlobalPresence() {
  const { user, couple } = useAuth();

  useEffect(() => {
    if (!user || !couple?.id) return;

    const coupleId = couple.id;
    const userId = user.uid;

    // 1. FIRESTORE HEARTBEAT (Runs across all pages every 15s)
    const firestorePresenceRef = doc(db, "couples", coupleId, "presence", userId);

    const sendFirestoreHeartbeat = async () => {
      try {
        await setDoc(firestorePresenceRef, {
          online: true,
          userId,
          lastSeen: serverTimestamp(),
          lastSeenMs: Date.now(),
        });
      } catch (err) {
        console.error("Firestore heartbeat error:", err);
      }
    };

    sendFirestoreHeartbeat();
    const heartbeatInterval = setInterval(sendFirestoreHeartbeat, 15000);

    // 2. REALTIME DATABASE PRESENCE (Multi-tab connected check)
    let unsubscribeConnected: (() => void) | null = null;
    try {
      const rtdb = getRtdb();
      const connectedRef = ref(rtdb, ".info/connected");
      const connectionsRef = ref(rtdb, `presence/${coupleId}/${userId}/connections`);

      unsubscribeConnected = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          const myConnRef = push(connectionsRef);
          onDisconnect(myConnRef).remove();
          set(myConnRef, true);
        }
      });
    } catch (err) {
      console.error("RTDB global presence setup notice:", err);
    }

    return () => {
      clearInterval(heartbeatInterval);
      if (unsubscribeConnected) unsubscribeConnected();

      // On unmount/logout, mark offline in Firestore
      setDoc(firestorePresenceRef, {
        online: false,
        userId,
        lastSeen: serverTimestamp(),
        lastSeenMs: Date.now(),
      }).catch(() => {});
    };
  }, [user, couple]);

  return null;
}
