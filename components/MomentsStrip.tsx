"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { Image as ImageIcon, Lock, Sparkles, ArrowRight, Palette } from "lucide-react";

export interface SharedMoment {
  id: string;
  type: "sketch" | "memory_placeholder" | "milestone";
  title: string;
  imageUrl?: string;
  authorName?: string;
  createdAt?: any;
}

export default function MomentsStrip() {
  const { couple } = useAuth();
  const [moments, setMoments] = useState<SharedMoment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const coupleId = couple?.id;

  useEffect(() => {
    if (!coupleId) return;

    const momentsCollRef = collection(db, "couples", coupleId, "moments");
    const q = query(momentsCollRef, orderBy("createdAt", "desc"), limit(8));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SharedMoment));
        setMoments(items);
        setLoading(false);
      },
      (err) => {
        console.error("Moments strip snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coupleId]);

  if (!coupleId) return null;

  return (
    <div className="moi-card p-6 bg-wine-950/80 border border-rose-500/30 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ImageIcon className="w-5 h-5 text-rose-400" />
          <h2 className="text-base font-bold text-white">Shared Couple Moments</h2>
        </div>

        <Link
          href="/moments"
          className="text-xs font-bold text-rose-300 hover:text-white flex items-center space-x-1 transition-colors"
        >
          <span>See all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center space-x-4 overflow-x-auto py-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-36 h-28 rounded-2xl bg-wine-900/40 animate-pulse shrink-0" />
          ))}
        </div>
      ) : moments.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-rose-500/20 rounded-2xl space-y-2">
          <Palette className="w-8 h-8 text-rose-300/40 mx-auto" />
          <p className="text-xs text-rose-200/60 font-medium">No moments captured yet.</p>
          <Link
            href="/doodle"
            className="inline-block text-xs font-bold text-rose-400 hover:text-rose-200 underline"
          >
            Create an Instant Sketch
          </Link>
        </div>
      ) : (
        <div className="flex items-center space-x-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-rose-500/20">
          {moments.map((m) => (
            <div
              key={m.id}
              className="w-40 h-32 rounded-2xl bg-wine-900/60 border border-rose-500/30 overflow-hidden shrink-0 relative group hover:border-rose-400 transition-all shadow-md"
            >
              {m.type === "sketch" && m.imageUrl ? (
                <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : m.type === "memory_placeholder" ? (
                <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#2D0A1C] to-[#17040E] text-rose-200 space-y-1">
                  <Lock className="w-6 h-6 text-amber-300 animate-pulse" />
                  <span className="text-[11px] font-bold leading-tight">Private Hub Memory</span>
                  <span className="text-[9px] text-rose-300/60">Encrypted 🔒</span>
                </div>
              ) : (
                <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center bg-gradient-to-tr from-rose-900 to-wine-800 text-white space-y-1">
                  <Sparkles className="w-6 h-6 text-amber-300 animate-bounce" />
                  <span className="text-[11px] font-bold leading-tight">{m.title}</span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent text-[10px] text-rose-100 font-semibold truncate px-2">
                {m.title}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
