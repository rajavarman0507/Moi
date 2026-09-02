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

    const firestorePresenceRef = doc(db, "couples", coupleId, "presence", userId);

    // Mark online in Firestore
    const setOnlineInFirestore = async (isOnline: boolean) => {
      try {
        await setDoc(firestorePresenceRef, {
          online: isOnline,
          userId,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Firestore presence error:", err);
      }
    };

    // Mark online immediately
    setOnlineInFirestore(true);

    // Heartbeat every 10 seconds to keep presence fresh
    const interval = setInterval(() => {
      setOnlineInFirestore(true);
    }, 10000);

    // Tab close / unload handlers
    const handleUnload = () => {
      setOnlineInFirestore(false);
    };
    window.addEventListener("beforeunload", handleUnload);

    // Realtime Database presence backup
    let unsubConnected: (() => void) | null = null;
    try {
      const rtdb = getRtdb();
      const connectedRef = ref(rtdb, ".info/connected");
      const userConnectionsRef = ref(rtdb, `presence/${coupleId}/${userId}/connections`);

      unsubConnected = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          const myConnRef = push(userConnectionsRef);
          onDisconnect(myConnRef).remove();
          set(myConnRef, true);
        }
      });
    } catch (err) {
      console.error("RTDB presence notice:", err);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      if (unsubConnected) unsubConnected();
      setOnlineInFirestore(false);
    };
  }, [user, couple]);

  return null;
}
