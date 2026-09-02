"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import sketchWords from "@/data/sketchWords.json";
import { SketchAndGuessState } from "@/lib/gameSchemas";
import CanvasBoard from "@/components/CanvasBoard";
import WaitingForPartner from "@/components/WaitingForPartner";
import { Pencil, Send, Sparkles, CheckCircle2, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function SketchAndGuessPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [gameState, setGameState] = useState<SketchAndGuessState | null>(null);
  const [guessInput, setGuessInput] = useState<string>("");

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);

  useEffect(() => {
    if (!couple?.id || !user?.uid || !partnerUid) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "sketchAndGuess");
    const unsubscribe = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as SketchAndGuessState);
      } else {
        const initialWord = sketchWords[0];
        const initialState: SketchAndGuessState = {
          drawerUid: user.uid,
          guesserUid: partnerUid,
          secretWord: initialWord,
          wordIndex: 0,
          guesses: [],
          isSolved: false,
          score: 0,
        };
        setDoc(gameDocRef, { ...initialState, updatedAt: serverTimestamp() });
        setGameState(initialState);
      }
    });

    return () => unsubscribe();
  }, [couple, user, partnerUid]);

  const isDrawer = Boolean(user?.uid && gameState?.drawerUid === user.uid);

  const handleSendGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couple?.id || !user?.uid || !gameState || isDrawer || !guessInput.trim() || gameState.isSolved) return;

    const cleanInput = guessInput.trim();
    const isCorrect = cleanInput.toLowerCase() === gameState.secretWord.toLowerCase();

    const newGuesses = [
      ...gameState.guesses,
      {
        userId: user.uid,
        text: cleanInput,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isCorrect,
      },
    ];

    const gameDocRef = doc(db, "couples", couple.id, "games", "sketchAndGuess");
    await setDoc(gameDocRef, {
      ...gameState,
      guesses: newGuesses,
      isSolved: isCorrect,
      score: isCorrect ? gameState.score + 1 : gameState.score,
      updatedAt: serverTimestamp(),
    });

    setGuessInput("");
  };

  const handleNextRound = async () => {
    if (!couple?.id || !gameState || !user?.uid || !partnerUid) return;

    // Clear Firestore strokes document
    const strokesDocRef = doc(db, "couples", couple.id, "sketchStrokes", "current");
    await setDoc(strokesDocRef, { points: [], updatedAt: serverTimestamp() });

    const nextIndex = (gameState.wordIndex + 1) % sketchWords.length;
    const nextWord = sketchWords[nextIndex];

    // Swap drawer and guesser roles
    const newDrawer = gameState.drawerUid === user.uid ? partnerUid : user.uid;
    const newGuesser = newDrawer === user.uid ? partnerUid : user.uid;

    const gameDocRef = doc(db, "couples", couple.id, "games", "sketchAndGuess");
    await setDoc(gameDocRef, {
      drawerUid: newDrawer,
      guesserUid: newGuesser,
      secretWord: nextWord,
      wordIndex: nextIndex,
      guesses: [],
      isSolved: false,
      score: gameState.score,
      updatedAt: serverTimestamp(),
    });
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Sketch & Guess...</p>
      </div>
    );
  }

  return (
    <WaitingForPartner>
      <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link
            href="/games"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-rose-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Games</span>
          </Link>

          <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-200">
            Round #{((gameState?.wordIndex || 0) % sketchWords.length) + 1} • Score: {gameState?.score || 0}
          </div>
        </div>

        {/* Role & Secret Word Banner */}
        <div className="moi-card p-6 bg-gradient-to-r from-[#2F0B1E]/90 via-[#3F112B]/90 to-[#1D0612]/90 border border-rose-500/30 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-rose-400" />
              <span>Your Role: {isDrawer ? "Artist (Drawing)" : "Guesser"}</span>
            </span>

            {isDrawer ? (
              <h2 className="text-xl font-extrabold text-amber-200 mt-1">
                Secret Word: <span className="underline decoration-amber-400">{gameState?.secretWord}</span>
              </h2>
            ) : (
              <h2 className="text-xl font-extrabold text-white mt-1">
                Guess what {partnerName} is drawing!
              </h2>
            )}
          </div>

          <button
            onClick={handleNextRound}
            className="px-4 py-2 rounded-xl bg-wine-950/80 hover:bg-wine-900 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Next Round</span>
          </button>
        </div>

        {/* Canvas & Live Guess Chat Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas Area */}
          <div className="lg:col-span-2 space-y-4">
            <CanvasBoard coupleId={couple.id} isDrawer={isDrawer} />
          </div>

          {/* Guesses Panel */}
          <div className="moi-card p-6 flex flex-col justify-between h-[420px] bg-wine-950/80 border border-rose-500/30">
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 border-b border-rose-900/40 pb-2">
                Live Guesses
              </h3>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {gameState?.guesses.length === 0 ? (
                  <p className="text-xs text-rose-300/40 italic">No guesses submitted yet...</p>
                ) : (
                  gameState?.guesses.map((g, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs flex items-center justify-between ${
                        g.isCorrect
                          ? "bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 font-bold"
                          : "bg-[#2A0A19] border border-rose-500/20 text-rose-100 font-medium"
                      }`}
                    >
                      <span>{g.text}</span>
                      <span className="text-[10px] text-rose-300/60 ml-2">{g.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Solved Celebration / Guess Input Form */}
            {gameState?.isSolved ? (
              <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-center space-y-2 animate-bounce">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-xs font-extrabold text-emerald-200">Correct! The word was "{gameState.secretWord}"!</p>
                <button
                  onClick={handleNextRound}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold w-full transition-colors"
                >
                  Swap Roles for Next Round! 🎨
                </button>
              </div>
            ) : !isDrawer ? (
              <form onSubmit={handleSendGuess} className="relative mt-2">
                <input
                  type="text"
                  required
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Type your guess here..."
                  className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/40 text-white font-semibold text-xs placeholder:text-rose-300/50 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 shadow-inner"
                  style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 p-2 rounded-xl bg-gradient-to-r from-rose-600 to-wine-700 text-white hover:from-rose-500 hover:to-wine-600 transition-all shadow-glow"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <p className="text-xs text-rose-300/70 text-center italic mt-2 font-medium">
                Draw clearly on the canvas so {partnerName} can guess!
              </p>
            )}
          </div>
        </div>
      </div>
    </WaitingForPartner>
  );
}
