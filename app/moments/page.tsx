"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import WaitingForPartner from "@/components/WaitingForPartner";
import { Image as ImageIcon, Lock, Sparkles, X, Palette, Heart, Calendar } from "lucide-react";
import Link from "next/link";

interface SharedMoment {
  id: string;
  type: "sketch" | "memory_placeholder" | "milestone";
  title: string;
  imageUrl?: string;
  authorName?: string;
  createdAt?: any;
}

type FilterTab = "all" | "sketch" | "milestone" | "memory_placeholder";

export default function MomentsPage() {
  const { couple, loading } = useAuth();
  const [moments, setMoments] = useState<SharedMoment[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const coupleId = couple?.id;

  useEffect(() => {
    if (!coupleId) return;

    const momentsCollRef = collection(db, "couples", coupleId, "moments");

    const unsubscribe = onSnapshot(
      momentsCollRef,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SharedMoment));
        // Sort chronologically in memory descending safely
        items.sort((a, b) => {
          const tA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || Date.now();
          const tB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || Date.now();
          return tB - tA;
        });
        setMoments(items);
      },
      (err) => console.error("Moments snapshot error:", err)
    );

    return () => unsubscribe();
  }, [coupleId]);

  const filteredMoments = moments.filter((m) => {
    if (filter === "all") return true;
    return m.type === filter;
  });

  if (loading || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Shared Moments Gallery...</p>
      </div>
    );
  }

  return (
    <WaitingForPartner>
      <div className="space-y-8 relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <span>Shared Moments Gallery</span>
              <ImageIcon className="w-6 h-6 text-rose-400" />
            </h1>
            <p className="text-xs text-rose-200/70 mt-1">
              Every Instant Sketch, milestone achievement, & encrypted Private Hub memory captured together.
            </p>
          </div>

          <Link
            href="/doodle"
            className="moi-button-primary px-5 py-2.5 text-xs font-extrabold inline-flex items-center space-x-2 shrink-0"
          >
            <Palette className="w-4 h-4" />
            <span>Create Instant Sketch</span>
          </Link>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap bg-wine-950/80 p-1.5 rounded-2xl border border-rose-500/20 gap-1 max-w-xl">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === "all" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
            }`}
          >
            All ({moments.length})
          </button>
          <button
            onClick={() => setFilter("sketch")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === "sketch" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
            }`}
          >
            Sketches
          </button>
          <button
            onClick={() => setFilter("milestone")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === "milestone" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
            }`}
          >
            Milestones
          </button>
          <button
            onClick={() => setFilter("memory_placeholder")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === "memory_placeholder" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
            }`}
          >
            Private Hub 🔒
          </button>
        </div>

        {/* Moments Grid */}
        {filteredMoments.length === 0 ? (
          <div className="text-center py-16 moi-card bg-wine-950/60 border border-rose-500/20 space-y-3">
            <ImageIcon className="w-12 h-12 text-rose-400/40 mx-auto" />
            <h3 className="text-base font-bold text-white">No moments found</h3>
            <p className="text-xs text-rose-200/60 max-w-sm mx-auto">
              Start doodling together or add memories to populate your Shared Moments Gallery.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredMoments.map((m) => (
              <div
                key={m.id}
                onClick={() => m.imageUrl && setSelectedImage(m.imageUrl)}
                className={`moi-card p-3 bg-wine-950/90 border border-rose-500/30 rounded-3xl space-y-3 group hover:border-rose-400 transition-all shadow-xl ${
                  m.imageUrl ? "cursor-pointer" : ""
                }`}
              >
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-wine-900/60 border border-rose-500/20 relative flex items-center justify-center">
                  {m.type === "sketch" && m.imageUrl ? (
                    <img
                      src={m.imageUrl}
                      alt={m.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : m.type === "memory_placeholder" ? (
                    <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#2D0A1C] to-[#17040E] text-rose-200 space-y-2">
                      <Lock className="w-10 h-10 text-amber-300 animate-pulse" />
                      <span className="text-xs font-bold leading-tight">Private Hub Memory</span>
                      <span className="text-[10px] text-rose-300/60">Protected Behind Shared PIN 🔒</span>
                    </div>
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-tr from-rose-900 via-wine-800 to-rose-700 text-white space-y-2">
                      <Sparkles className="w-10 h-10 text-amber-300 animate-bounce" />
                      <span className="text-xs font-bold leading-tight">{m.title}</span>
                    </div>
                  )}
                </div>

                <div className="px-1 space-y-0.5">
                  <h4 className="text-xs font-bold text-white truncate">{m.title}</h4>
                  <p className="text-[10px] text-rose-300/60 flex items-center justify-between">
                    <span>{m.authorName || "Couple"}</span>
                    <span>{m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : "Just now"}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image Modal Lightbox */}
        {selectedImage && (
          <div
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 bg-[#12040A]/90 backdrop-blur-xl z-50 flex items-center justify-center p-6 cursor-pointer"
          >
            <div className="relative max-w-3xl max-h-[85vh] w-full h-full flex items-center justify-center">
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-rose-950 text-white hover:bg-rose-900 z-10"
              >
                <X className="w-6 h-6" />
              </button>
              <img src={selectedImage} alt="Full Sketch" className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border border-rose-500/40" />
            </div>
          </div>
        )}
      </div>
    </WaitingForPartner>
  );
}
