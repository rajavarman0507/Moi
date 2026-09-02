"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, getRtdb } from "@/lib/firebase";
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { Flame, Sparkles } from "lucide-react";

export default function CandleMode() {
  const { user, couple, partnerProfile } = useAuth();
  const [isLit, setIsLit] = useState<boolean>(false);
  const [partnerOnline, setPartnerOnline] = useState<boolean>(false);

  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Your partner";

  useEffect(() => {
    if (!user || !couple?.id) return;

    const userId = user.uid;
    const partnerId = couple.userIds.find((id) => id !== userId);
    if (!partnerId) return;

    // Ensure my own presence document is set to online: true right away
    const myPresenceRef = doc(db, "couples", couple.id, "presence", userId);
    setDoc(myPresenceRef, {
      online: true,
      userId,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});

    // Listen to Firestore presence collection for both partners
    const presenceCollRef = collection(db, "couples", couple.id, "presence");
    const unsubFirestore = onSnapshot(presenceCollRef, (snap) => {
      const docs = snap.docs.map((d) => d.data());

      const myData = docs.find((d) => d.userId === userId);
      const partnerData = docs.find((d) => d.userId === partnerId);

      const iAmOnline = Boolean(myData?.online);
      const partnerIsOnline = Boolean(partnerData?.online);

      setPartnerOnline(partnerIsOnline);
      // Candle lights up if both partners are online OR if I am on Home and partner is online
      setIsLit(partnerIsOnline && (iAmOnline || true));
    });

    // Backup listener for Realtime Database
    let unsubRtdb: (() => void) | null = null;
    try {
      const rtdb = getRtdb();
      const couplePresenceRef = ref(rtdb, `presence/${couple.id}`);
      unsubRtdb = onValue(couplePresenceRef, (snap) => {
        const val = snap.val();
        if (val && partnerId) {
          const partnerConns = val[partnerId]?.connections;
          if (partnerConns && Object.keys(partnerConns).length > 0) {
            setPartnerOnline(true);
            setIsLit(true);
          }
        }
      });
    } catch (err) {
      console.error("RTDB candle mode notice:", err);
    }

    return () => {
      unsubFirestore();
      if (unsubRtdb) unsubRtdb();
    };
  }, [user, couple]);

  return (
    <div className="moi-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#240A17]/90 via-[#350F22]/90 to-[#190510]/90 border border-rose-500/30 text-center space-y-4 shadow-2xl">
      <div className="flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-300">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>Candle Mode</span>
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
      </div>

      {/* Pure CSS Candle & Glowing Flame */}
      <div className="relative w-28 h-36 mx-auto flex flex-col items-center justify-end py-2">
        {/* Flame & Glowing Aura */}
        <div className="relative mb-1 flex items-center justify-center">
          {isLit && (
            <div className="absolute w-24 h-24 rounded-full bg-amber-400/35 blur-2xl animate-pulse" />
          )}

          <div
            className={`w-7 h-11 rounded-full transition-all duration-700 relative ${
              isLit
                ? "bg-gradient-to-t from-amber-500 via-rose-400 to-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.95)] animate-bounce"
                : "bg-gradient-to-t from-rose-950 via-wine-900 to-rose-900/40 opacity-40"
            }`}
            style={{
              animationDuration: isLit ? "1.5s" : "0s",
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            }}
          >
            {/* Flame Inner Core */}
            {isLit && (
              <div className="w-3 h-6 bg-white rounded-full mx-auto mt-2 blur-[1px] animate-pulse" />
            )}
          </div>
        </div>

        {/* Candle Wick */}
        <div className="w-1 h-3 bg-zinc-700 rounded-t" />

        {/* Candle Wax Body */}
        <div className="w-12 h-16 rounded-t-lg bg-gradient-to-b from-rose-100/90 via-rose-200/80 to-rose-300/70 border border-rose-300/40 shadow-inner relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-rose-200/90 rounded-t-lg" />
        </div>
      </div>

      {/* Presence Status Subtitle */}
      <div className="space-y-1">
        <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
          <span>{isLit ? "Your Couple Candle is Lit! ♥" : "Candle is Dimmed"}</span>
          <Flame className={`w-4 h-4 ${isLit ? "text-amber-300 fill-amber-300 animate-pulse" : "text-rose-900"}`} />
        </h3>
        <p className="text-xs text-rose-200/70 max-w-xs mx-auto">
          {isLit ? (
            <span className="text-amber-200 font-semibold">
              Both you and {partnerName} are online together right now!
            </span>
          ) : partnerOnline ? (
            <span>{partnerName} is online! Open the app together to light the candle.</span>
          ) : (
            <span>Lights up automatically when both of you have the app open at the same time.</span>
          )}
        </p>
      </div>
    </div>
  );
}
