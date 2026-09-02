"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Heart, Calendar, Gamepad2, Sparkles, Lock, Layers, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  const [daysTogether, setDaysTogether] = useState<number | null>(null);
  const [monthsYears, setMonthsYears] = useState<string>("");

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else if (!couple) {
        router.push("/pair");
      }
    }
  }, [user, couple, loading, router]);

  useEffect(() => {
    if (couple?.togetherSince) {
      const startDate = new Date(couple.togetherSince);
      const today = new Date();

      startDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      const diffTime = Math.abs(today.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      setDaysTogether(diffDays);

      const years = Math.floor(diffDays / 365);
      const remainingDays = diffDays % 365;
      const months = Math.floor(remainingDays / 30);

      let breakdown = "";
      if (years > 0) breakdown += `${years} year${years > 1 ? "s" : ""} `;
      if (months > 0) breakdown += `${months} month${months > 1 ? "s" : ""}`;
      setMonthsYears(breakdown.trim());
    }
  }, [couple]);

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 rounded-3xl bg-gradient-to-tr from-rose-600 to-wine-700 animate-pulse flex items-center justify-center text-white font-bold shadow-glow">
          <Heart className="w-6 h-6 fill-white" />
        </div>
        <p className="text-sm font-medium text-rose-300 animate-pulse">Loading your space...</p>
      </div>
    );
  }

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  return (
    <div className="space-y-8 relative z-10">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>{myName} & {partnerName}</span>
            <span className="text-rose-500 animate-bounce">♥</span>
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            Connected in your private space • Together since{" "}
            <span className="font-semibold text-rose-300">{couple.togetherSince}</span>
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow self-start md:self-auto">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400 animate-pulse" />
          <span>Paired Account</span>
        </div>
      </div>

      {/* Hero Card: Together for X Days Counter */}
      <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#270B18]/90 via-[#3B1124]/90 to-[#1D0612]/90 border border-rose-500/30 shadow-2xl">
        <div className="max-w-xl space-y-4 relative z-10">
          <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-rose-400" />
            <span>Love Journey Counter</span>
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          </span>

          <div className="space-y-1">
            <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-rose-400 to-amber-200 tracking-tight drop-shadow-[0_0_25px_rgba(225,29,72,0.4)]">
              {daysTogether !== null ? daysTogether : "--"}
              <span className="text-2xl md:text-4xl font-bold text-rose-300 ml-3">days</span>
            </div>
            {monthsYears && (
              <p className="text-sm md:text-base font-semibold text-amber-200/90">
                ({monthsYears})
              </p>
            )}
          </div>

          <p className="text-sm text-rose-200/80 leading-relaxed pt-2">
            Every single day is a milestone in your story. Keep building memories, asking questions, and writing your journal together.
          </p>
        </div>

        <div className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full bg-rose-600/20 pointer-events-none blur-3xl animate-pulse" />
      </div>

      {/* Feature Navigation Cards Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>Explore Your Space</span>
          <Sparkles className="w-5 h-5 text-amber-300" />
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/games" className="moi-card p-6 block hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-wine-800 flex items-center justify-center text-white mb-4 shadow-glow group-hover:scale-110 transition-transform">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors">Couple Games</h3>
            <p className="text-xs text-rose-200/60 mt-1">Quiz each other & discover preferences.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          <Link href="/cards" className="moi-card p-6 block hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-wine-800 flex items-center justify-center text-white mb-4 shadow-glow group-hover:scale-110 transition-transform">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors">Card Decks</h3>
            <p className="text-xs text-rose-200/60 mt-1">Deep conversation starters for two.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          <Link href="/mood" className="moi-card p-6 block hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-wine-800 flex items-center justify-center text-white mb-4 shadow-glow group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors">Daily Mood</h3>
            <p className="text-xs text-rose-200/60 mt-1">Share how you feel with your partner.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          <Link href="/hub" className="moi-card p-6 block hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-wine-800 flex items-center justify-center text-white mb-4 shadow-glow group-hover:scale-110 transition-transform">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors">Private Hub</h3>
            <p className="text-xs text-rose-200/60 mt-1">Shared journal, goals & memories.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
