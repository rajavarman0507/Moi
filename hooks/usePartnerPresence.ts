"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export interface PartnerPresenceData {
  online: boolean;
  currentPath: string;
  updatedAt?: any;
}

export function usePartnerPresence() {
  const { user, couple, partnerProfile } = useAuth();
  const [presence, setPresence] = useState<PartnerPresenceData>({
    online: false,
    currentPath: "/",
  });

  useEffect(() => {
    if (!user || !couple?.id) return;

    const partnerId = couple.userIds.find((id) => id !== user.uid);
    if (!partnerId) return;

    const partnerPresenceRef = doc(db, "couples", couple.id, "presence", partnerId);
    const unsubscribe = onSnapshot(
      partnerPresenceRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PartnerPresenceData;
          setPresence({
            online: Boolean(data.online),
            currentPath: data.currentPath || "/",
          });
        } else {
          setPresence({ online: false, currentPath: "/" });
        }
      },
      (err) => {
        console.error("Partner presence snapshot error:", err);
      }
    );

    return () => unsubscribe();
  }, [user, couple]);

  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  return { ...presence, partnerName };
}
