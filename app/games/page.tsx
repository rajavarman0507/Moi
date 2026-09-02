"use client";

import React from "react";
import { Gamepad2, Sparkles } from "lucide-react";

export default function GamesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 relative z-10">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-600 to-wine-700 flex items-center justify-center text-white shadow-glow">
        <Gamepad2 className="w-8 h-8" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h1 className="text-2xl font-bold text-white">Couple Games</h1>
        <p className="text-xs text-rose-200/70">
          Fun interactive quizzes, trivia, and playful challenges for two.
        </p>
      </div>
      <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>Coming soon in Phase 2</span>
      </div>
    </div>
  );
}
