"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getDailyPromptForDate, DailyPrompt } from "@/lib/dailyPrompt";
import CandleMode from "@/components/CandleMode";
import MomentsStrip from "@/components/MomentsStrip";
import { Heart, Calendar, Gamepad2, Sparkles, Lock, Layers, ArrowRight, CheckCircle2, Palette } from "lucide-react";
import Link from "next/link";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getUtcDateString } from "@/lib/dateUtils";

export default function HomePage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  const [daysTogether, setDaysTogether] = useState<number | null>(null);
  const [monthsYears, setMonthsYears] = useState<string>("");
  const [dailyPrompt, setDailyPrompt] = useState<DailyPrompt | null>(null);
  const [promptCompleted, setPromptCompleted] = useState<boolean>(false);

  const utcToday = getUtcDateString();

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
    // Get deterministic prompt of the day
    const todayPrompt = getDailyPromptForDate(utcToday);
    setDailyPrompt(todayPrompt);

    if (couple?.id && user?.uid) {
      // Check if current user marked prompt complete for today
      const promptDocRef = doc(db, "couples", couple.id, "dailyPrompts", `${utcToday}_${user.uid}`);
      getDoc(promptDocRef).then((snap) => {
        if (snap.exists()) {
          setPromptCompleted(true);
        }
      }).catch((err) => console.warn("Prompt complete check error:", err));
    }
  }, [utcToday, couple, user]);

  useEffect(() => {
    if (couple?.togetherSince && couple.id) {
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

      // Idempotent Milestone Check & Creation (e.g., 100 days, 365 days / 1 year, 500 days)
      const milestones = [
        { days: 100, title: "100 Days Together Milestone! 🎉" },
        { days: 365, title: "1 Year Anniversary Milestone! 💖" },
        { days: 500, title: "500 Days Together Milestone! ✨" },
        { days: 1000, title: "1,000 Days Together Milestone! 👑" },
      ];

      milestones.forEach((m) => {
        if (diffDays >= m.days) {
          const milestoneDocRef = doc(db, "couples", couple.id, "moments", `milestone_${m.days}`);
          setDoc(
            milestoneDocRef,
            {
              type: "milestone",
              title: m.title,
              authorName: "Together",
              createdAt: serverTimestamp(),
            },
            { merge: true }
          ).catch((err) => console.warn("Milestone write error:", err));
        }
      });
    }
  }, [couple]);

  const handleTogglePromptComplete = async () => {
    if (!couple?.id || !user?.uid || !dailyPrompt) return;
    const promptDocRef = doc(db, "couples", couple.id, "dailyPrompts", `${utcToday}_${user.uid}`);

    if (promptCompleted) {
      setPromptCompleted(false);
    } else {
      setPromptCompleted(true);
      await setDoc(promptDocRef, {
        promptId: dailyPrompt.id,
        date: utcToday,
        userId: user.uid,
        completedAt: serverTimestamp(),
      });
    }
  };

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

      {/* Top Grid: Hero Counter + Candle Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero Card: Together for X Days Counter */}
        <div className="lg:col-span-2 moi-card p-8 md:p-10 relative overflow-hidden bg-gradient-to-br from-[#270B18]/90 via-[#3B1124]/90 to-[#1D0612]/90 border border-rose-500/30 shadow-2xl flex flex-col justify-between">
          <div className="max-w-xl space-y-4 relative z-10">
            <span className="text-xs uppercase font-bold text-rose-400 tracking-wider flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-rose-400" />
              <span>Love Journey Counter</span>
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </span>

            <div className="space-y-1">
              <div className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-rose-400 to-amber-200 tracking-tight drop-shadow-[0_0_25px_rgba(225,29,72,0.4)]">
                {daysTogether !== null ? daysTogether : "--"}
                <span className="text-2xl md:text-3xl font-bold text-rose-300 ml-3">days</span>
              </div>
              {monthsYears && (
                <p className="text-sm md:text-base font-semibold text-amber-200/90">
                  ({monthsYears})
                </p>
              )}
            </div>

            <p className="text-xs md:text-sm text-rose-200/80 leading-relaxed pt-2">
              Every single day is a milestone in your story. Keep building memories, asking questions, and writing your journal together.
            </p>
          </div>

          <div className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full bg-rose-600/20 pointer-events-none blur-3xl animate-pulse" />
        </div>

        {/* Candle Mode Widget */}
        <CandleMode />
      </div>

      {/* Shared Moments Gallery Strip */}
      <MomentsStrip />

      {/* Daily Couple Joy Prompt Section */}
      {dailyPrompt && (
        <div className="moi-card p-6 md:p-8 bg-gradient-to-r from-[#2F0B1E]/90 via-[#44112B]/90 to-[#230615]/90 border border-rose-500/40 relative overflow-hidden shadow-glow">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 flex-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-300/30 text-xs font-bold text-amber-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Daily Couple Joy Prompt ({utcToday})</span>
              </div>

              <h2 className="text-xl md:text-2xl font-bold text-white">
                {dailyPrompt.title}
              </h2>
              <p className="text-sm text-rose-100/90 leading-relaxed max-w-2xl">
                {dailyPrompt.text}
              </p>
            </div>

            <button
              onClick={handleTogglePromptComplete}
              className={`flex items-center space-x-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all shadow-md shrink-0 ${
                promptCompleted
                  ? "bg-emerald-600 text-white border border-emerald-400/40"
                  : "moi-button-primary"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{promptCompleted ? "Completed Today! ♥" : "Mark Done Today"}</span>
            </button>
          </div>
        </div>
      )}

// NoticeBoardCanvas removed from home screen per user request

      {/* Feature Navigation Cards Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>Explore Your Space</span>
          <Sparkles className="w-5 h-5 text-amber-300" />
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/doodle" className="moi-card p-6 block hover:-translate-y-1 transition-all group border-amber-500/30">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 via-wine-700 to-amber-600 flex items-center justify-center text-white mb-4 shadow-glow group-hover:scale-110 transition-transform">
              <Palette className="w-6 h-6 text-amber-200" />
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-rose-300 transition-colors">Doodle Together</h3>
            <p className="text-xs text-rose-200/60 mt-1">Draw freehand & send Instant Sketches.</p>
            <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-4">
              <span>Start Doodling</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

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
            <p className="text-xs text-rose-200/60 mt-1">150+ deep conversation starters for two.</p>
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
