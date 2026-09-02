"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import statementsData from "@/data/neverHaveIEver.json";
import { NeverHaveIEverState } from "@/lib/gameSchemas";
import WaitingForPartner from "@/components/WaitingForPartner";
import { PartyPopper, Sparkles, RefreshCw, ArrowLeft, Hand } from "lucide-react";
import Link from "next/link";

export default function NeverHaveIEverPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [gameState, setGameState] = useState<NeverHaveIEverState | null>(null);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";
  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);

  useEffect(() => {
    if (!couple?.id || !user?.uid) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "neverHaveIEver");
    const unsubscribe = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as NeverHaveIEverState);
      } else {
        const initialState: NeverHaveIEverState = {
          statementIndex: 0,
          raisedHands: {},
          bothRaisedCount: 0,
        };
        setDoc(gameDocRef, { ...initialState, updatedAt: serverTimestamp() });
        setGameState(initialState);
      }
    });

    return () => unsubscribe();
  }, [couple, user]);

  const statement = gameState ? statementsData[gameState.statementIndex % statementsData.length] : statementsData[0];
  const myRaised = user?.uid && gameState?.raisedHands ? Boolean(gameState.raisedHands[user.uid]) : false;
  const partnerRaised = partnerUid && gameState?.raisedHands ? Boolean(gameState.raisedHands[partnerUid]) : false;
  const bothRaised = myRaised && partnerRaised;

  const handleToggleRaise = async () => {
    if (!couple?.id || !user?.uid || !gameState) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "neverHaveIEver");
    const updatedRaised = { ...gameState.raisedHands, [user.uid]: !myRaised };

    const willBothBeRaised = partnerUid ? Boolean(updatedRaised[user.uid] && updatedRaised[partnerUid]) : false;
    let newBothCount = gameState.bothRaisedCount;

    if (willBothBeRaised && !bothRaised) {
      newBothCount += 1;
    }

    await setDoc(gameDocRef, {
      ...gameState,
      raisedHands: updatedRaised,
      bothRaisedCount: newBothCount,
      updatedAt: serverTimestamp(),
    });
  };

  const handleNextStatement = async () => {
    if (!couple?.id || !gameState) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "neverHaveIEver");
    await setDoc(gameDocRef, {
      ...gameState,
      statementIndex: (gameState.statementIndex + 1) % statementsData.length,
      raisedHands: {},
      updatedAt: serverTimestamp(),
    });
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Never Have I Ever...</p>
      </div>
    );
  }

  return (
    <WaitingForPartner>
      <div className="space-y-8 relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <Link
            href="/games"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-rose-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Games</span>
          </Link>

          <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-200">
            Both Raised Hands: {gameState?.bothRaisedCount || 0} 🙌
          </div>
        </div>

        <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 border border-rose-500/40 text-center space-y-8 shadow-2xl">
          <div className="space-y-2">
            <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center justify-center gap-2">
              <PartyPopper className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Card #{((gameState?.statementIndex || 0) % statementsData.length) + 1} of {statementsData.length}</span>
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">Never Have I Ever...</h2>
          </div>

          <p className="text-xl md:text-2xl font-bold text-white leading-relaxed px-4">
            "{statement}"
          </p>

          {/* Partner Hand State Indicator */}
          <div className="flex justify-center items-center space-x-6 pt-2">
            <div className={`p-3 rounded-2xl border text-xs font-bold transition-all ${myRaised ? "bg-rose-500/30 border-rose-400 text-rose-200 shadow-glow" : "bg-wine-950/60 border-rose-500/20 text-rose-300/60"}`}>
              {myName}: {myRaised ? "Hand Raised ✋" : "Haven't Done This"}
            </div>

            <div className={`p-3 rounded-2xl border text-xs font-bold transition-all ${partnerRaised ? "bg-amber-500/30 border-amber-400 text-amber-200 shadow-glow" : "bg-wine-950/60 border-rose-500/20 text-rose-300/60"}`}>
              {partnerName}: {partnerRaised ? "Hand Raised ✋" : "Haven't Done This"}
            </div>
          </div>

          {bothRaised && (
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 font-extrabold text-sm animate-bounce">
              Both of you have done this! 🙌 Tell the story!
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={handleToggleRaise}
              className={`w-full sm:w-auto px-6 py-3.5 rounded-2xl text-xs font-extrabold transition-all ${
                myRaised
                  ? "bg-amber-500 text-black shadow-glow"
                  : "moi-button-primary"
              }`}
            >
              <Hand className="w-4 h-4 inline mr-2" />
              <span>{myRaised ? "Lower My Hand" : "I Have Done This! ✋"}</span>
            </button>

            <button
              onClick={handleNextStatement}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl moi-button-secondary text-xs font-bold flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Flip Next Card</span>
            </button>
          </div>
        </div>
      </div>
    </WaitingForPartner>
  );
}
