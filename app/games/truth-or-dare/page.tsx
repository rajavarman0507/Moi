"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import truthOrDareData from "@/data/truthOrDare.json";
import { TruthOrDareState } from "@/lib/gameSchemas";
import WaitingForPartner from "@/components/WaitingForPartner";
import { Flame, Sparkles, CheckCircle2, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function TruthOrDarePage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [gameState, setGameState] = useState<TruthOrDareState | null>(null);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  useEffect(() => {
    if (!couple?.id || !user?.uid) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "truthOrDare");
    const unsubscribe = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as TruthOrDareState);
      } else {
        const initialState: TruthOrDareState = {
          currentTurnUid: user.uid,
          choice: null,
          cardText: null,
          cardIndex: 0,
          completedTurns: 0,
        };
        setDoc(gameDocRef, { ...initialState, updatedAt: serverTimestamp() });
        setGameState(initialState);
      }
    });

    return () => unsubscribe();
  }, [couple, user]);

  const isMyTurn = Boolean(user?.uid && gameState?.currentTurnUid === user.uid);
  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);
  const activeTurnName = isMyTurn ? myName : partnerName;

  const handleChoose = async (choice: "truth" | "dare") => {
    if (!couple?.id || !gameState || !isMyTurn || gameState.choice) return;

    const list = choice === "truth" ? truthOrDareData.truths : truthOrDareData.dares;
    const drawnText = list[gameState.cardIndex % list.length];

    const gameDocRef = doc(db, "couples", couple.id, "games", "truthOrDare");
    await setDoc(gameDocRef, {
      ...gameState,
      choice,
      cardText: drawnText,
      updatedAt: serverTimestamp(),
    });
  };

  const handleCompleteTurn = async () => {
    if (!couple?.id || !gameState || !partnerUid) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "truthOrDare");
    await setDoc(gameDocRef, {
      currentTurnUid: partnerUid,
      choice: null,
      cardText: null,
      cardIndex: gameState.cardIndex + 1,
      completedTurns: gameState.completedTurns + 1,
      updatedAt: serverTimestamp(),
    });
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Truth or Dare...</p>
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
            Turns Completed: {gameState?.completedTurns || 0}
          </div>
        </div>

        <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 border border-rose-500/40 text-center space-y-8 shadow-2xl">
          {/* Turn Indicator */}
          <div className="space-y-2">
            <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center justify-center gap-2">
              <Flame className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Current Turn</span>
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">
              {isMyTurn ? "It's Your Turn! ♥" : `It's ${partnerName}'s Turn`}
            </h2>
          </div>

          {/* Choice Step */}
          {!gameState?.choice && (
            <div className="space-y-6">
              <p className="text-xs text-rose-200/70">
                {isMyTurn
                  ? "Choose whether you want to answer a Truth or complete a Dare!"
                  : `Waiting for ${partnerName} to pick Truth or Dare...`}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => handleChoose("truth")}
                  disabled={!isMyTurn}
                  className="p-6 rounded-3xl border border-rose-400/40 bg-gradient-to-tr from-rose-700 to-wine-800 text-white font-extrabold text-lg hover:scale-105 transition-all shadow-glow disabled:opacity-50"
                >
                  📖 TRUTH
                </button>

                <button
                  onClick={() => handleChoose("dare")}
                  disabled={!isMyTurn}
                  className="p-6 rounded-3xl border border-amber-400/40 bg-gradient-to-tr from-amber-600 to-wine-800 text-white font-extrabold text-lg hover:scale-105 transition-all shadow-glow disabled:opacity-50"
                >
                  🔥 DARE
                </button>
              </div>
            </div>
          )}

          {/* Drawn Card Step */}
          {gameState?.choice && gameState.cardText && (
            <div className="p-8 rounded-3xl bg-wine-950/90 border border-rose-500/40 space-y-6 animate-float-up" style={{ animationDuration: "0.5s" }}>
              <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-400/30 uppercase tracking-widest">
                <span>{gameState.choice.toUpperCase()} FOR {activeTurnName.toUpperCase()}</span>
              </div>

              <p className="text-xl md:text-2xl font-bold text-white leading-relaxed">
                "{gameState.cardText}"
              </p>

              <button
                onClick={handleCompleteTurn}
                className="moi-button-primary inline-flex items-center space-x-2 text-xs py-3.5 px-8 font-bold"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Done! Pass Turn to {isMyTurn ? partnerName : myName}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </WaitingForPartner>
  );
}
