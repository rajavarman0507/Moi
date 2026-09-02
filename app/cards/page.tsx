"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import connectionCardsData from "@/data/connectionCards.json";
import { Layers, Sparkles, CheckCircle2, RefreshCw, Heart, ChevronRight } from "lucide-react";

export interface ConnectionCard {
  id: string;
  category: string;
  question: string;
}

const CATEGORIES = [
  "All Decks",
  "Deep Talk",
  "Fun & Playful",
  "Future Dreams",
  "Memory Lane",
  "Spicy",
];

export default function CardsPage() {
  const { user, couple, loading } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<string>("All Decks");
  const [filteredCards, setFilteredCards] = useState<ConnectionCard[]>(connectionCardsData);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answeredCardIds, setAnsweredCardIds] = useState<Set<string>>(new Set());

  // Filter cards based on selected category
  useEffect(() => {
    if (selectedCategory === "All Decks") {
      setFilteredCards(connectionCardsData);
    } else {
      setFilteredCards(
        connectionCardsData.filter((card) => card.category === selectedCategory)
      );
    }
    setCurrentIndex(0);
  }, [selectedCategory]);

  // Subscribe to answered cards subcollection in Firestore
  useEffect(() => {
    if (!couple?.id) return;

    const answeredRef = collection(db, "couples", couple.id, "answeredCards");
    const unsubscribe = onSnapshot(answeredRef, (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach((docSnap) => {
        ids.add(docSnap.id);
      });
      setAnsweredCardIds(ids);
    });

    return () => unsubscribe();
  }, [couple]);

  const currentCard = filteredCards[currentIndex] || filteredCards[0];
  const isAnswered = currentCard ? answeredCardIds.has(currentCard.id) : false;

  const handleNextCard = () => {
    if (filteredCards.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const handleToggleAnswered = async () => {
    if (!couple?.id || !user?.uid || !currentCard) return;

    const cardDocRef = doc(db, "couples", couple.id, "answeredCards", currentCard.id);

    if (isAnswered) {
      // Keep answered state permanent or toggle
    } else {
      await setDoc(cardDocRef, {
        cardId: currentCard.id,
        category: currentCard.category,
        answeredAt: serverTimestamp(),
        answeredBy: user.uid,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading connection decks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Connection Decks</span>
            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            150+ deep conversation starters designed to bring you closer every day.
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow self-start md:self-auto">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>
            {answeredCardIds.size} of {connectionCardsData.length} Answered
          </span>
        </div>
      </div>

      {/* Category Tabs Filter */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow border border-rose-400/30"
                  : "bg-wine-950/60 border border-rose-500/20 text-rose-200/70 hover:text-white hover:bg-wine-900/60"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Main Single Card Viewer */}
      {currentCard && (
        <div className="moi-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-[#2F0B1E]/95 via-[#3F112B]/95 to-[#1D0612]/95 border border-rose-500/40 shadow-2xl min-h-[380px] flex flex-col justify-between">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between">
            <span className="px-3.5 py-1.5 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-300">
              {currentCard.category}
            </span>

            <span className="text-xs font-mono font-medium text-rose-300/60">
              Card {currentIndex + 1} of {filteredCards.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="my-8 text-center space-y-4">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-relaxed tracking-tight max-w-2xl mx-auto">
              "{currentCard.question}"
            </h2>

            {isAnswered && (
              <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-xs font-semibold text-emerald-300 shadow-sm animate-pulse">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Answered Together ♥</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-rose-900/40">
            <button
              onClick={handleToggleAnswered}
              disabled={isAnswered}
              className={`w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3.5 rounded-2xl text-xs font-bold transition-all shadow-md ${
                isAnswered
                  ? "bg-emerald-600/80 text-white cursor-default"
                  : "moi-button-primary"
              }`}
            >
              <Heart className={`w-4 h-4 ${isAnswered ? "fill-white" : ""}`} />
              <span>{isAnswered ? "Answered Together" : "Mark Answered Together"}</span>
            </button>

            <button
              onClick={handleNextCard}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3.5 rounded-2xl moi-button-secondary text-xs font-bold"
            >
              <span>Next Card</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Glow backdrop effect */}
          <div className="absolute -right-20 -top-20 w-60 h-60 rounded-full bg-rose-600/15 blur-3xl pointer-events-none" />
        </div>
      )}
    </div>
  );
}
