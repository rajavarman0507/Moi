"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import quizQuestions from "@/data/compatibilityQuiz.json";
import { CompatibilityQuizState } from "@/lib/gameSchemas";
import WaitingForPartner from "@/components/WaitingForPartner";
import { CheckSquare, Sparkles, CheckCircle2, ArrowLeft, RefreshCw, Heart } from "lucide-react";
import Link from "next/link";

export default function CompatibilityQuizPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [gameState, setGameState] = useState<CompatibilityQuizState | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  useEffect(() => {
    if (!couple?.id || !user?.uid) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "compatibilityQuiz");
    const unsubscribe = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        setGameState(snap.data() as CompatibilityQuizState);
      } else {
        const initialState: CompatibilityQuizState = {
          answers: {},
          completed: {},
          compatibilityScore: null,
        };
        setDoc(gameDocRef, { ...initialState, updatedAt: serverTimestamp() });
        setGameState(initialState);
      }
    });

    return () => unsubscribe();
  }, [couple, user]);

  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);

  const myAnswers = user?.uid && gameState?.answers ? gameState.answers[user.uid] || {} : {};
  const isMyFinished = user?.uid && gameState?.completed ? Boolean(gameState.completed[user.uid]) : false;
  const isPartnerFinished = partnerUid && gameState?.completed ? Boolean(gameState.completed[partnerUid]) : false;
  const bothFinished = isMyFinished && isPartnerFinished;

  const handleSelectOption = async (questionId: number, optionIndex: number) => {
    if (!couple?.id || !user?.uid || !gameState || isMyFinished) return;

    const gameDocRef = doc(db, "couples", couple.id, "games", "compatibilityQuiz");
    const updatedMyAnswers = { ...myAnswers, [questionId]: optionIndex };
    const newAnswers = { ...gameState.answers, [user.uid]: updatedMyAnswers };

    const isNowFinished = Object.keys(updatedMyAnswers).length >= quizQuestions.length;
    const newCompleted = { ...gameState.completed, [user.uid]: isNowFinished };

    let score: number | null = gameState.compatibilityScore;
    const isPartnerDone = partnerUid && newCompleted[partnerUid];

    if (isNowFinished && isPartnerDone && partnerUid) {
      const partnerAns = newAnswers[partnerUid] || {};
      let matchCount = 0;
      quizQuestions.forEach((q) => {
        if (updatedMyAnswers[q.id] === partnerAns[q.id]) {
          matchCount += 1;
        }
      });
      score = Math.round((matchCount / quizQuestions.length) * 100);
    }

    await setDoc(gameDocRef, {
      answers: newAnswers,
      completed: newCompleted,
      compatibilityScore: score,
      updatedAt: serverTimestamp(),
    });

    if (!isNowFinished) {
      setCurrentQIndex((prev) => Math.min(prev + 1, quizQuestions.length - 1));
    }
  };

  const handleRestartQuiz = async () => {
    if (!couple?.id) return;
    const gameDocRef = doc(db, "couples", couple.id, "games", "compatibilityQuiz");
    await setDoc(gameDocRef, {
      answers: {},
      completed: {},
      compatibilityScore: null,
      updatedAt: serverTimestamp(),
    });
    setCurrentQIndex(0);
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Compatibility Quiz...</p>
      </div>
    );
  }

  const q = quizQuestions[currentQIndex];
  const mySelectedOption = myAnswers[q.id];

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
            Progress: {Object.keys(myAnswers).length} / {quizQuestions.length}
          </div>
        </div>

        {/* Results Screen when BOTH Finish */}
        {bothFinished && gameState?.compatibilityScore !== null && gameState?.compatibilityScore !== undefined ? (
          <div className="moi-card p-8 md:p-12 border border-rose-500/40 text-center space-y-8 bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 shadow-2xl">
            <div className="space-y-3">
              <span className="text-xs uppercase font-extrabold text-amber-300 tracking-wider flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Quiz Results</span>
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white">
                {myName} & {partnerName} Compatibility
              </h2>
            </div>

            <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-rose-400 to-amber-200 drop-shadow-[0_0_25px_rgba(225,29,72,0.5)]">
              {gameState.compatibilityScore}%
            </div>

            {/* Answer Match Breakdown */}
            <div className="space-y-4 text-left pt-4 border-t border-rose-900/40">
              <h3 className="text-sm font-bold text-rose-300">Question Match Breakdown:</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {quizQuestions.map((q) => {
                  const partnerAnsIndex = partnerUid && gameState.answers ? gameState.answers[partnerUid]?.[q.id] : null;
                  const myAnsIndex = myAnswers[q.id];
                  const isMatch = myAnsIndex === partnerAnsIndex;

                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                        isMatch
                          ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
                          : "bg-wine-950/60 border-rose-500/20 text-rose-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{q.id}. {q.question}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] ${isMatch ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                          {isMatch ? "Matched ♥" : "Different"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                        <div><span className="font-semibold text-rose-300">{myName}:</span> {q.options[myAnsIndex]}</div>
                        <div><span className="font-semibold text-amber-300">{partnerName}:</span> {partnerAnsIndex !== undefined && partnerAnsIndex !== null ? q.options[partnerAnsIndex] : "No answer"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleRestartQuiz}
              className="moi-button-primary inline-flex items-center space-x-2 text-xs py-3 px-6 font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retake Quiz</span>
            </button>
          </div>
        ) : isMyFinished ? (
          /* Waiting for Partner */
          <div className="moi-card p-8 md:p-12 text-center space-y-4 bg-gradient-to-br from-[#2F0B1E]/95 to-[#1D0612]/95 border border-rose-500/40 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-300 mx-auto flex items-center justify-center shadow-glow animate-pulse">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">You Completed Your Quiz!</h2>
            <p className="text-xs text-rose-200/70 max-w-sm mx-auto">
              Waiting for {partnerName} to finish answering. Results will automatically reveal once both of you complete all 10 questions!
            </p>
          </div>
        ) : (
          /* Active Question Step */
          <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 border border-rose-500/40 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-300">
                Question {currentQIndex + 1} of {quizQuestions.length}
              </span>

              <div className="flex space-x-1.5">
                {quizQuestions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentQIndex(idx)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      idx === currentQIndex
                        ? "bg-rose-400 scale-125"
                        : myAnswers[quizQuestions[idx].id] !== undefined
                        ? "bg-emerald-400"
                        : "bg-rose-900/40"
                    }`}
                  />
                ))}
              </div>
            </div>

            <h2 className="text-xl md:text-2xl font-extrabold text-white leading-relaxed">
              "{q.question}"
            </h2>

            <div className="space-y-3">
              {q.options.map((opt, optIdx) => {
                const isSelected = mySelectedOption === optIdx;
                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectOption(q.id, optIdx)}
                    className={`w-full p-4 rounded-2xl border text-left text-xs md:text-sm font-semibold transition-all ${
                      isSelected
                        ? "bg-gradient-to-r from-rose-600 to-wine-700 border-rose-400 text-white shadow-glow"
                        : "bg-wine-950/60 border-rose-500/20 text-rose-100 hover:border-rose-400/40 hover:bg-wine-900/60"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </WaitingForPartner>
  );
}
