"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, getRtdb } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, onValue, push, onDisconnect, set } from "firebase/database";

export default function GlobalPresence() {
  const { user, couple } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!user || !couple?.id) return;

    const coupleId = couple.id;
    const userId = user.uid;

    const firestorePresenceRef = doc(db, "couples", coupleId, "presence", userId);

    const updateLocationInFirestore = async (isOnline: boolean) => {
      try {
        await setDoc(firestorePresenceRef, {
          online: isOnline,
          userId,
          currentPath: pathname,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error("Firestore presence location error:", err);
      }
    };

    // Update location immediately when pathname changes
    updateLocationInFirestore(true);

    // Heartbeat every 10 seconds
    const interval = setInterval(() => {
      updateLocationInFirestore(true);
    }, 10000);

    const handleUnload = () => {
      updateLocationInFirestore(false);
    };
    window.addEventListener("beforeunload", handleUnload);

    // RTDB presence backup
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
      updateLocationInFirestore(false);
    };
  }, [user, couple, pathname]);

  return null;
}
