"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getRtdb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { WifiOff, Sparkles } from "lucide-react";

export default function WaitingForPartner({ children }: { children: React.ReactNode }) {
  const { user, couple, partnerProfile } = useAuth();
  const [partnerOnline, setPartnerOnline] = useState<boolean>(true);

  useEffect(() => {
    if (!user || !couple) return;

    try {
      const rtdb = getRtdb();
      const partnerId = couple.userIds.find((id) => id !== user.uid);
      if (!partnerId) return;

      const couplePresenceRef = ref(rtdb, `presence/${couple.id}`);
      const unsubscribe = onValue(couplePresenceRef, (snap) => {
        const val = snap.val();
        if (!val || !val[partnerId]) {
          setPartnerOnline(false);
          return;
        }

        const partnerConns = val[partnerId]?.connections;
        const isOnline = Boolean(partnerConns && Object.keys(partnerConns).length > 0);
        setPartnerOnline(isOnline);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error("Presence check error:", err);
    }
  }, [user, couple]);

  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  return (
    <div className="relative min-h-[400px]">
      {children}

      {!partnerOnline && (
        <div className="absolute inset-0 bg-[#12040A]/90 backdrop-blur-md z-40 rounded-3xl flex flex-col items-center justify-center p-8 text-center space-y-4 border border-rose-500/30">
          <div className="w-14 h-14 rounded-3xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-300 shadow-glow animate-pulse">
            <WifiOff className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white flex items-center justify-center gap-2">
              <span>Waiting for {partnerName} to reconnect</span>
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" style={{ animationDuration: "4s" }} />
            </h3>
            <p className="text-xs text-rose-200/70 max-w-sm">
              Your partner closed the tab or lost connection mid-game. The game state is saved live!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
