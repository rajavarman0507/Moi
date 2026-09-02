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

      // Clear time part for accurate day difference
      startDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      const diffTime = Math.abs(today.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      setDaysTogether(diffDays);

      // Compute years & months breakdown
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
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-plum-800 to-plum-600 animate-pulse flex items-center justify-center text-cream-50 font-bold">
          M
        </div>
        <p className="text-sm font-medium text-plum-600 animate-pulse">Loading your space...</p>
      </div>
    );
  }

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-plum-900">
            {myName} & {partnerName}
          </h1>
          <p className="text-sm text-plum-500 mt-1">
            Connected in your private space • Together since{" "}
            <span className="font-semibold text-plum-700">{couple.togetherSince}</span>
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-100/60 border border-rose-200 text-xs font-semibold text-plum-800 self-start md:self-auto">
          <Heart className="w-4 h-4 text-plum-700 fill-plum-700" />
          <span>Paired Account</span>
        </div>
      </div>

      {/* Hero Card: Together for X Days Counter */}
      <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-white via-rose-50/50 to-cream-100 border border-rose-100 shadow-soft">
        <div className="max-w-xl space-y-4 relative z-10">
          <span className="text-xs uppercase font-semibold text-plum-600 tracking-wider flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-plum-600" />
            <span>Love Journey Counter</span>
          </span>

          <div className="space-y-1">
            <div className="text-5xl md:text-7xl font-extrabold text-plum-900 tracking-tight">
              {daysTogether !== null ? daysTogether : "--"}
              <span className="text-2xl md:text-3xl font-semibold text-plum-600 ml-3">days</span>
            </div>
            {monthsYears && (
              <p className="text-sm md:text-base font-medium text-plum-600">
                ({monthsYears})
              </p>
            )}
          </div>

          <p className="text-sm text-plum-700 leading-relaxed pt-2">
            Every single day is a milestone in your story. Keep building memories, asking questions, and writing your journal together.
          </p>
        </div>

        {/* Subtle Decorative Backdrop Circle */}
        <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-rose-100/40 pointer-events-none blur-2xl" />
      </div>

      {/* Feature Navigation Cards Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-plum-900">Explore Your Space</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/games" className="moi-card p-6 block hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-plum-800 mb-4">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-plum-900">Couple Games</h3>
            <p className="text-xs text-plum-500 mt-1">Quiz each other & discover preferences.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-plum-700 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link href="/cards" className="moi-card p-6 block hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-plum-800 mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-plum-900">Card Decks</h3>
            <p className="text-xs text-plum-500 mt-1">Deep conversation starters for two.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-plum-700 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link href="/mood" className="moi-card p-6 block hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-plum-800 mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-plum-900">Daily Mood</h3>
            <p className="text-xs text-plum-500 mt-1">Share how you feel with your partner.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-plum-700 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link href="/hub" className="moi-card p-6 block hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-plum-800 mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-plum-900">Private Hub</h3>
            <p className="text-xs text-plum-500 mt-1">Shared journal, goals & memories.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-plum-700 mt-4">
              <span>Explore</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
