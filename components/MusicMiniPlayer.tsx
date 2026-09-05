"use client";

import React from "react";
import Link from "next/link";
import { useMusic } from "@/context/MusicContext";
import { useAuth } from "@/context/AuthContext";
import { Play, Pause, Music, Volume2, Sparkles, Radio } from "lucide-react";

export default function MusicMiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    pendingAutoplayJoin,
    joinSyncPlayback,
    isReconnecting,
  } = useMusic();
  const { user, partnerProfile } = useAuth();

  if (!currentTrack) return null;

  const isDJPartner =
    currentTrack.updatedBy && currentTrack.updatedBy !== user?.uid;
  const partnerName = partnerProfile?.displayName || "Partner";

  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 left-4 md:left-72 z-40 max-w-xl mx-auto transition-all animate-float-up">
      <div className="moi-card p-3 bg-wine-950/95 border border-rose-500/40 shadow-2xl flex items-center justify-between gap-3 relative overflow-hidden backdrop-blur-xl">
        {/* Left: Thumbnail & Song Title */}
        <Link href="/music" className="flex items-center space-x-3 flex-1 min-w-0 group">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-wine-900 border border-rose-500/30 shrink-0 relative">
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            {isPlaying && (
              <div className="absolute inset-0 bg-rose-950/40 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-white truncate group-hover:text-rose-300 transition-colors">
                {currentTrack.title}
              </h4>
              {isReconnecting && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-semibold text-[9px] border border-amber-400/30 shrink-0 animate-pulse">
                  Reconnecting...
                </span>
              )}
            </div>
            <p className="text-[11px] text-rose-200/60 truncate flex items-center gap-1.5 pt-0.5">
              <span>{currentTrack.channelTitle}</span>
              {isDJPartner && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-semibold text-[10px]">
                  ▶ {partnerName} is DJing
                </span>
              )}
            </p>
          </div>
        </Link>

        {/* Right: Autoplay Gesture Join or Play/Pause Button */}
        {pendingAutoplayJoin ? (
          <button
            onClick={joinSyncPlayback}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-wine-700 hover:from-rose-500 hover:to-wine-600 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg animate-pulse shrink-0"
          >
            <Radio className="w-3.5 h-3.5 text-amber-300" />
            <span>Tap to Join Sync</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={togglePlayPause}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-rose-600 to-wine-700 hover:from-rose-500 hover:to-wine-600 text-white flex items-center justify-center shadow-md transition-transform active:scale-95"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <Link
              href="/music"
              className="p-2.5 rounded-xl bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-500/20"
              title="Expand Music Player"
            >
              <Music className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
