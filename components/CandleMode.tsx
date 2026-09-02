"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getRtdb } from "@/lib/firebase";
import {
  ref,
  onValue,
  push,
  onDisconnect,
  set,
  serverTimestamp,
} from "firebase/database";
import { Flame, Sparkles } from "lucide-react";

export default function CandleMode() {
  const { user, couple } = useAuth();
  const [isLit, setIsLit] = useState<boolean>(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean>(false);

  useEffect(() => {
    if (!user || !couple) return;

    try {
      const rtdb = getRtdb();
      const coupleId = couple.id;
      const userId = user.uid;

      // Multi-connection presence tracking refs
      const connectedRef = ref(rtdb, ".info/connected");
      const userPresenceRef = ref(rtdb, `presence/${coupleId}/${userId}`);
      const connectionsRef = ref(rtdb, `presence/${coupleId}/${userId}/connections`);
      const couplePresenceRef = ref(rtdb, `presence/${coupleId}`);

      // Manage local multi-tab connection
      const unsubscribeConnected = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          // Add this tab's connection node
          const myConnRef = push(connectionsRef);

          // On disconnect (tab close), remove this specific connection node
          onDisconnect(myConnRef).remove();

          // Set active state for this connection
          set(myConnRef, true);

          // Update last online timestamp
          set(ref(rtdb, `presence/${coupleId}/${userId}/lastOnline`), serverTimestamp());
        }
      });

      // Listen to couple presence across all partners
      const unsubscribeCouplePresence = onValue(couplePresenceRef, (snap) => {
        const val = snap.val();
        if (!val) {
          setIsLit(false);
          setPartnerOnline(false);
          return;
        }

        const partnerId = couple.userIds.find((id) => id !== userId);

        const myConnections = val[userId]?.connections;
        const partnerConnections = partnerId ? val[partnerId]?.connections : null;

        const iAmOnline = Boolean(myConnections && Object.keys(myConnections).length > 0);
        const partnerIsOnline = Boolean(partnerConnections && Object.keys(partnerConnections).length > 0);

        setPartnerOnline(partnerIsOnline);
        setIsLit(iAmOnline && partnerIsOnline);
      });

      return () => {
        unsubscribeConnected();
        unsubscribeCouplePresence();
      };
    } catch (err) {
      console.error("Realtime Database presence error:", err);
    }
  }, [user, couple]);

  return (
    <div className="moi-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#240A17]/90 via-[#350F22]/90 to-[#190510]/90 border border-rose-500/30 text-center space-y-4">
      <div className="flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-300">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>Candle Mode</span>
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
      </div>

      {/* Pure CSS Candle & Flame */}
      <div className="relative w-24 h-32 mx-auto flex flex-col items-center justify-end py-2">
        {/* Flame & Glowing Halo */}
        <div className="relative mb-1 flex items-center justify-center">
          {isLit && (
            <div className="absolute w-20 h-20 rounded-full bg-amber-400/20 blur-xl animate-pulse" />
          )}

          <div
            className={`w-6 h-10 rounded-full transition-all duration-700 relative ${
              isLit
                ? "bg-gradient-to-t from-amber-500 via-rose-400 to-amber-200 shadow-[0_0_25px_rgba(251,191,36,0.9)] animate-bounce"
                : "bg-gradient-to-t from-rose-950 via-wine-900 to-rose-900/40 opacity-40"
            }`}
            style={{
              animationDuration: isLit ? "1.5s" : "0s",
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            }}
          >
            {/* Flame Inner Core */}
            {isLit && (
              <div className="w-2.5 h-5 bg-white rounded-full mx-auto mt-2 blur-[1px] animate-pulse" />
            )}
          </div>
        </div>

        {/* Candle Wick */}
        <div className="w-1 h-3 bg-zinc-700 rounded-t" />

        {/* Candle Wax Body */}
        <div className="w-10 h-16 rounded-t-lg bg-gradient-to-b from-rose-100/90 via-rose-200/80 to-rose-300/70 border border-rose-300/40 shadow-inner relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-rose-200/90 rounded-t-lg" />
        </div>
      </div>

      {/* Presence Status Subtitle */}
      <div className="space-y-1">
        <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
          <span>{isLit ? "Your Couple Candle is Lit!" : "Candle is Dimmed"}</span>
          <Flame className={`w-4 h-4 ${isLit ? "text-amber-300 fill-amber-300 animate-pulse" : "text-rose-900"}`} />
        </h3>
        <p className="text-xs text-rose-200/70 max-w-xs mx-auto">
          {isLit ? (
            <span className="text-amber-200 font-semibold">
              Both of you are in the app together right now ♥
            </span>
          ) : partnerOnline ? (
            <span>Your partner is online! Open the app together to light the candle.</span>
          ) : (
            <span>Lit automatically when both of you have the app open at the same time.</span>
          )}
        </p>
      </div>
    </div>
  );
}
