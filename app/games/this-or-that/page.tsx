"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import thisOrThatPrompts from "@/data/thisOrThat.json";
import { ThisOrThatState } from "@/lib/gameSchemas";
import WaitingForPartner from "@/components/WaitingForPartner";
import { Heart, Sparkles, CheckCircle2, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ThisOrThatPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [gameState, setGameState] = useState<ThisOrThatState | null>(null);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  useEffect(() => {
    if (!couple?.id) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "thisOrThat");
    const unsubscribe = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as ThisOrThatState);
      } else {
        // Initialize state
        const initialState: ThisOrThatState = {
          promptIndex: 0,
          picks: {},
          revealed: false,
          scoreMatches: 0,
          totalPlayed: 0,
        };
        setDoc(gameDocRef, { ...initialState, updatedAt: serverTimestamp() });
        setGameState(initialState);
      }
    });

    return () => unsubscribe();
  }, [couple]);

  const prompt = gameState ? thisOrThatPrompts[gameState.promptIndex % thisOrThatPrompts.length] : thisOrThatPrompts[0];
  const myPick = user?.uid && gameState?.picks ? gameState.picks[user.uid] : null;

  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);
  const partnerPick = partnerUid && gameState?.picks ? gameState.picks[partnerUid] : null;

  const bothPicked = Boolean(myPick && partnerPick);
  const isMatch = bothPicked && myPick === partnerPick;

  const handlePick = async (option: "optionA" | "optionB") => {
    if (!couple?.id || !user?.uid || !gameState || myPick) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "thisOrThat");
    const newPicks = { ...gameState.picks, [user.uid]: option };
    const willBothBePicked = Object.keys(newPicks).length >= 2;

    let newMatches = gameState.scoreMatches;
    let newTotal = gameState.totalPlayed;

    if (willBothBePicked) {
      newTotal += 1;
      const pickValues = Object.values(newPicks);
      if (pickValues[0] === pickValues[1]) {
        newMatches += 1;
      }
    }

    await setDoc(gameDocRef, {
      ...gameState,
      picks: newPicks,
      revealed: willBothBePicked,
      scoreMatches: newMatches,
      totalPlayed: newTotal,
      updatedAt: serverTimestamp(),
    });
  };

  const handleNextPrompt = async () => {
    if (!couple?.id || !gameState) return;
    const gameDocRef = doc(db, "couples", couple.id, "games", "thisOrThat");

    await setDoc(gameDocRef, {
      ...gameState,
      promptIndex: (gameState.promptIndex + 1) % thisOrThatPrompts.length,
      picks: {},
      revealed: false,
      updatedAt: serverTimestamp(),
    });
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading This or That...</p>
      </div>
    );
  }

  return (
    <WaitingForPartner>
      <div className="space-y-8 relative z-10 max-w-3xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/games"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-rose-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Games</span>
          </Link>

          <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-200">
            Matches: {gameState?.scoreMatches || 0} / {gameState?.totalPlayed || 0}
          </div>
        </div>

        {/* Card */}
        <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 border border-rose-500/40 text-center space-y-8 shadow-2xl">
          <div className="space-y-2">
            <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Prompt #{((gameState?.promptIndex || 0) % thisOrThatPrompts.length) + 1}</span>
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">This or That?</h2>
          </div>

          {/* Options Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handlePick("optionA")}
              disabled={Boolean(myPick)}
              className={`p-6 rounded-3xl border text-base font-bold transition-all ${
                myPick === "optionA"
                  ? "bg-gradient-to-r from-rose-600 to-wine-700 border-rose-400 text-white shadow-glow scale-105"
                  : "bg-wine-950/60 border-rose-500/20 text-rose-100 hover:border-rose-400/50 hover:bg-wine-900/60"
              }`}
            >
              {prompt.optionA}
            </button>

            <button
              onClick={() => handlePick("optionB")}
              disabled={Boolean(myPick)}
              className={`p-6 rounded-3xl border text-base font-bold transition-all ${
                myPick === "optionB"
                  ? "bg-gradient-to-r from-rose-600 to-wine-700 border-rose-400 text-white shadow-glow scale-105"
                  : "bg-wine-950/60 border-rose-500/20 text-rose-100 hover:border-rose-400/50 hover:bg-wine-900/60"
              }`}
            >
              {prompt.optionB}
            </button>
          </div>

          {/* Reveal & Status Section */}
          {bothPicked ? (
            <div className="p-6 rounded-3xl bg-wine-950/80 border border-rose-500/40 space-y-4 animate-float-up" style={{ animationDuration: "0.5s" }}>
              {isMatch ? (
                <div className="space-y-1 text-emerald-300">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 mx-auto flex items-center justify-center text-emerald-400 shadow-glow">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">You Matched! ♥</h3>
                  <p className="text-xs text-emerald-200/80">Both of you picked the exact same option!</p>
                </div>
              ) : (
                <div className="space-y-1 text-amber-300">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 mx-auto flex items-center justify-center text-amber-300 shadow-glow">
                    <Heart className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">You're Different — Tell Me Why!</h3>
                  <p className="text-xs text-rose-200/80">
                    {myName} picked: <span className="font-bold text-white">{myPick === "optionA" ? prompt.optionA : prompt.optionB}</span>
                    <br />
                    {partnerName} picked: <span className="font-bold text-white">{partnerPick === "optionA" ? prompt.optionA : prompt.optionB}</span>
                  </p>
                </div>
              )}

              <button
                onClick={handleNextPrompt}
                className="moi-button-primary inline-flex items-center space-x-2 text-xs py-3 px-6"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Next Prompt</span>
              </button>
            </div>
          ) : myPick ? (
            <div className="p-4 rounded-2xl bg-wine-950/60 border border-rose-500/20 text-xs font-semibold text-amber-200 animate-pulse">
              You picked! Waiting for {partnerName} to make their choice...
            </div>
          ) : (
            <p className="text-xs text-rose-300/60">Pick privately — answers are revealed when both of you have chosen.</p>
          )}
        </div>
      </div>
    </WaitingForPartner>
  );
}
