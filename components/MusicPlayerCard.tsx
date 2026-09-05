"use client";

import React, { useState, useEffect } from "react";
import { useMusic, Track } from "@/context/MusicContext";
import { useAuth } from "@/context/AuthContext";
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Music,
  Radio,
  Sparkles,
  AlertCircle,
  Clock,
  WifiOff,
} from "lucide-react";

export default function MusicPlayerCard() {
  const {
    currentTrack,
    queue,
    isPlaying,
    localVolume,
    pendingAutoplayJoin,
    measuredDriftSec,
    searchWarning,
    currentTime,
    duration,
    isReconnecting,
    playTrack,
    togglePlayPause,
    seekTo,
    addToQueue,
    removeFromQueue,
    reorderQueueItem,
    skipNextTrack,
    setLocalVolume,
    joinSyncPlayback,
    searchTracks,
  } = useMusic();

  const { user, partnerProfile } = useAuth();
  const partnerName = partnerProfile?.displayName || "Partner";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    const results = await searchTracks(searchQuery.trim());
    setSearchResults(results);
    setIsSearching(false);
  };

  const isDJPartner =
    currentTrack?.updatedBy && currentTrack.updatedBy !== user?.uid;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-400/30 inline-flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Shared Real-Time Music Stream</span>
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Couple Music Lounge 🎵
          </h1>
          <p className="text-xs text-rose-200/70">
            Listen together in perfect sync with live partner DJ attribution and shared queue.
          </p>
        </div>

        {/* Sync Drift Badge */}
        <div className="px-3.5 py-2 rounded-2xl moi-card bg-wine-900/60 border border-rose-500/30 text-right shrink-0">
          <div className="text-[11px] font-semibold text-rose-300 flex items-center justify-end gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-300" />
            <span>Drift Correction Engine</span>
          </div>
          <p className="text-xs font-bold text-white font-mono">
            Measured Drift: <span className="text-emerald-400">{measuredDriftSec}s</span>
          </p>
        </div>
      </div>

      {/* BUG 4 FIX: Informational Reconnecting Banner (never blocks playback) */}
      {isReconnecting && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs flex items-center space-x-2 animate-pulse">
          <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Reconnecting to stream server... Local playback is unaffected.</span>
        </div>
      )}

      {/* Autoplay Gesture Join Banner */}
      {pendingAutoplayJoin && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-600 via-wine-700 to-rose-600 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse border border-rose-400/40">
          <div className="flex items-center space-x-3">
            <Radio className="w-6 h-6 text-amber-300 shrink-0" />
            <div className="text-left">
              <h4 className="text-sm font-bold">
                {partnerName} is currently listening to {currentTrack?.title}!
              </h4>
              <p className="text-xs text-rose-100/80">
                Browser autoplay policy requires a tap to start audio in frame-perfect sync.
              </p>
            </div>
          </div>

          <button
            onClick={joinSyncPlayback}
            className="px-5 py-2.5 rounded-xl bg-white text-rose-950 font-extrabold text-xs hover:bg-rose-100 transition-transform active:scale-95 shrink-0 shadow-md"
          >
            ▶ Tap to Join Sync
          </button>
        </div>
      )}

      {/* Search Proxy Warning Badge */}
      {searchWarning && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
          <span>{searchWarning}</span>
        </div>
      )}

      {/* MAIN NOW PLAYING CARD */}
      <div className="moi-card p-6 md:p-8 bg-wine-950/90 border border-rose-500/40 space-y-6 shadow-2xl relative overflow-hidden">
        {currentTrack ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Album Art / Thumbnail */}
            <div className="md:col-span-5 relative group">
              <div className="aspect-square rounded-3xl overflow-hidden bg-wine-900 border-2 border-rose-500/40 shadow-2xl relative">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {isPlaying && (
                  <div className="absolute inset-0 bg-rose-950/30 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="flex items-center space-x-1.5">
                      <div className="w-1.5 h-8 bg-rose-400 rounded-full animate-pulse" />
                      <div className="w-1.5 h-12 bg-rose-500 rounded-full animate-pulse delay-100" />
                      <div className="w-1.5 h-6 bg-rose-400 rounded-full animate-pulse delay-200" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Track Controls & Metadata */}
            <div className="md:col-span-7 space-y-6">
              {/* Partner DJ Attribution Banner */}
              {isDJPartner ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-400/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>▶ {partnerName} is DJing</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-900/40 text-rose-200/80 text-xs font-semibold border border-rose-500/20">
                  <span>▶ You are DJing</span>
                </div>
              )}

              <div className="space-y-1">
                <h2 className="text-2xl font-extrabold text-white leading-tight">
                  {currentTrack.title}
                </h2>
                <p className="text-sm text-rose-300/80 font-medium">
                  {currentTrack.channelTitle}
                </p>
              </div>

              {/* Progress Seek Bar */}
              <div className="space-y-2 pt-2">
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? Math.floor(duration) : 100}
                  value={Math.min(currentTime, duration || 100)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    seekTo(val);
                  }}
                  className="w-full h-2 rounded-lg bg-rose-950 appearance-none cursor-pointer accent-rose-500"
                />
                <div className="flex justify-between text-[11px] font-mono text-rose-300/60">
                  <span>{formatTime(currentTime)}</span>
                  <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
                </div>
              </div>

              {/* Playback Controls & Local Volume Slider */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-2">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={togglePlayPause}
                    className="w-16 h-16 rounded-full bg-gradient-to-tr from-rose-600 to-wine-700 hover:from-rose-500 hover:to-wine-600 text-white flex items-center justify-center shadow-glow transition-transform active:scale-95"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                  </button>

                  <button
                    onClick={skipNextTrack}
                    className="p-3.5 rounded-2xl bg-rose-900/40 hover:bg-rose-900/70 text-rose-300 border border-rose-500/30 transition-transform active:scale-95"
                    title="Skip to Next Track in Queue"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>

                {/* LOCAL Volume Control (Never Synced) */}
                <div className="flex items-center space-x-2.5 bg-rose-950/60 px-4 py-2.5 rounded-2xl border border-rose-500/20">
                  <button
                    onClick={() => setLocalVolume(localVolume === 0 ? 80 : 0)}
                    className="text-rose-300 hover:text-white"
                  >
                    {localVolume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={localVolume}
                    onChange={(e) => setLocalVolume(parseInt(e.target.value, 10))}
                    className="w-24 h-1.5 rounded-lg bg-rose-900 appearance-none cursor-pointer accent-rose-400"
                  />
                  <span className="text-[11px] font-mono text-rose-300/80 w-6">
                    {localVolume}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State when no track is currently playing */
          <div className="text-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-400/30 flex items-center justify-center mx-auto text-rose-400">
              <Music className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Queue is empty</h3>
              <p className="text-xs text-rose-200/70">
                Search for a song below to start listening together!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SEARCH SECTION & SHARED QUEUE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT: YouTube Song Search */}
        <div className="lg:col-span-7 moi-card p-6 bg-wine-950/80 border border-rose-500/30 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-rose-400" />
            <span>Search YouTube Songs</span>
          </h3>

          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song name or artist..."
              className="flex-1 p-3.5 rounded-2xl border border-rose-500/30 text-xs placeholder:text-rose-400/40 focus:border-rose-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="moi-button-primary px-5 text-xs font-extrabold flex items-center space-x-1.5 shrink-0"
            >
              <Search className="w-4 h-4" />
              <span>{isSearching ? "Searching..." : "Search"}</span>
            </button>
          </form>

          {/* Search Results List */}
          <div className="space-y-3 pt-2 max-h-[380px] overflow-y-auto pr-1">
            {searchResults.map((t) => (
              <div
                key={t.videoId}
                className="p-3 rounded-2xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/20 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <img
                    src={t.thumbnail}
                    alt={t.title}
                    className="w-12 h-12 rounded-xl object-cover border border-rose-500/30 shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{t.title}</h4>
                    <p className="text-[11px] text-rose-300/60 truncate">{t.channelTitle}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => playTrack(t)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    <span>Play</span>
                  </button>
                  <button
                    onClick={() => addToQueue(t)}
                    className="px-3 py-1.5 rounded-xl bg-wine-800 hover:bg-wine-700 text-rose-200 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Queue</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Shared Up Next Queue List */}
        <div className="lg:col-span-5 moi-card p-6 bg-wine-950/80 border border-rose-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-300" />
              <span>Up Next Queue ({queue.length})</span>
            </h3>
          </div>

          {queue.length === 0 ? (
            <div className="p-8 text-center text-xs text-rose-300/50 italic border border-dashed border-rose-900/40 rounded-2xl">
              Queue is empty — search for a song to add!
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-rose-950/50 border border-rose-500/20 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="text-xs font-mono font-bold text-rose-400 w-4 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-rose-500/20"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                      <p className="text-[10px] text-rose-300/60 truncate">{item.channelTitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {idx > 0 && (
                      <button
                        onClick={() => reorderQueueItem(item.id, queue[idx - 1].order - 1)}
                        className="p-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-900/60 text-rose-300"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {idx < queue.length - 1 && (
                      <button
                        onClick={() => reorderQueueItem(item.id, queue[idx + 1].order + 1)}
                        className="p-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-900/60 text-rose-300"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-700/60 text-rose-400 hover:text-white"
                      title="Remove from Queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
