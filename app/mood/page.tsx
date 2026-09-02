"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { getUtcDateString, formatDisplayDate } from "@/lib/dateUtils";
import MoodChart, { MoodRecord } from "@/components/MoodChart";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { Sparkles, Heart, CheckCircle2, Calendar } from "lucide-react";

interface MoodOption {
  id: string;
  emoji: string;
  label: string;
  score: number;
}

const MOOD_OPTIONS: MoodOption[] = [
  { id: "loved", emoji: "💖", label: "Loved", score: 7 },
  { id: "passionate", emoji: "🔥", label: "Passionate", score: 6 },
  { id: "happy", emoji: "😊", label: "Happy", score: 5 },
  { id: "cozy", emoji: "☕", label: "Cozy", score: 4 },
  { id: "tired", emoji: "😴", label: "Tired", score: 3 },
  { id: "needy", emoji: "🥺", label: "Needy", score: 2 },
  { id: "low", emoji: "🌧️", label: "Low", score: 1 },
];

export default function MoodPage() {
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  const [moodEntries, setMoodEntries] = useState<MoodRecord[]>([]);
  const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const utcToday = getUtcDateString();

  // Subscribe to moods subcollection in Firestore
  useEffect(() => {
    if (!couple?.id) return;

    const moodsRef = collection(db, "couples", couple.id, "moods");
    const q = query(moodsRef, orderBy("date", "desc"), limit(60));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: MoodRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        entries.push({
          id: docSnap.id,
          userId: data.userId,
          date: data.date,
          moodId: data.moodId,
          emoji: data.emoji,
          label: data.label,
          score: data.score,
        });
      });
      setMoodEntries(entries);

      // Check if user already logged mood today
      if (user?.uid) {
        const todayEntry = entries.find((e) => e.date === utcToday && e.userId === user.uid);
        if (todayEntry) {
          setSelectedMoodId(todayEntry.moodId);
        }
      }
    });

    return () => unsubscribe();
  }, [couple, user, utcToday]);

  const handleSelectMood = async (option: MoodOption) => {
    if (!couple?.id || !user?.uid) return;
    setSelectedMoodId(option.id);
    setIsSaving(true);

    try {
      const docId = `${utcToday}_${user.uid}`;
      const moodDocRef = doc(db, "couples", couple.id, "moods", docId);

      await setDoc(moodDocRef, {
        userId: user.uid,
        date: utcToday,
        moodId: option.id,
        emoji: option.emoji,
        label: option.label,
        score: option.score,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error saving mood:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading daily mood space...</p>
      </div>
    );
  }

  const partnerId = couple.userIds.find((id) => id !== user.uid);
  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  const todayMyEntry = moodEntries.find((e) => e.date === utcToday && e.userId === user.uid);
  const todayPartnerEntry = partnerId ? moodEntries.find((e) => e.date === utcToday && e.userId === partnerId) : null;

  return (
    <div className="space-y-8 relative z-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Daily Mood Check-in</span>
            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            Express your emotional vibe today and stay synchronized with {partnerName}.
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow self-start md:self-auto">
          <Calendar className="w-4 h-4 text-rose-400" />
          <span>Today: {utcToday}</span>
        </div>
      </div>

      {/* Mood Selector Grid */}
      <div className="moi-card p-6 md:p-8 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center justify-between">
          <span>How are you feeling today, {myName}?</span>
          {todayMyEntry && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Logged for Today
            </span>
          )}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {MOOD_OPTIONS.map((opt) => {
            const isSelected = selectedMoodId === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelectMood(opt)}
                disabled={isSaving}
                className={`p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 border transition-all ${
                  isSelected
                    ? "bg-gradient-to-tr from-rose-600 to-wine-700 border-rose-400 shadow-glow scale-105"
                    : "bg-wine-950/60 border-rose-500/20 hover:border-rose-400/40 hover:bg-wine-900/40"
                }`}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="text-xs font-bold text-white">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Partner Today Mood Banner */}
      <div className="moi-card p-6 bg-gradient-to-r from-[#2B0A1A]/90 via-[#3C0F25]/90 to-[#1C0511]/90 border border-rose-500/30 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-2xl shadow-sm">
            {todayPartnerEntry ? todayPartnerEntry.emoji : "❓"}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{partnerName}'s Mood Today</h3>
            <p className="text-xs text-rose-200/70">
              {todayPartnerEntry
                ? `${todayPartnerEntry.emoji} ${todayPartnerEntry.label}`
                : `${partnerName} has not checked in yet today.`}
            </p>
          </div>
        </div>

        {todayPartnerEntry && (
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
            Checked In
          </span>
        )}
      </div>

      {/* Shared 30-Day History Chart */}
      <div className="moi-card p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">30-Day Shared Mood History</h2>
          <span className="text-xs text-rose-300/70">Side-by-Side Mood Scores</span>
        </div>

        <MoodChart
          moodEntries={moodEntries}
          myUid={user.uid}
          partnerUid={partnerId}
          myName={myName}
          partnerName={partnerName}
        />
      </div>
    </div>
  );
}
