"use client";

import React from "react";
import { Activity, X, Wifi } from "lucide-react";
import { CallStatsSnapshot } from "@/lib/call/adaptiveQuality";

interface CallDebugOverlayProps {
  stats: CallStatsSnapshot | null;
  reconnectStatus?: string | null;
  onClose?: () => void;
}

export default function CallDebugOverlay({ stats, reconnectStatus, onClose }: CallDebugOverlayProps) {
  if (!stats) return null;

  const qualityColor =
    stats.quality === "good" ? "text-emerald-400" : stats.quality === "fair" ? "text-amber-400" : "text-rose-400";

  return (
    <div className="absolute bottom-24 right-4 z-30 max-w-xs w-64 p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-rose-500/30 text-white text-[11px] font-mono shadow-2xl space-y-2 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <div className="flex items-center gap-1.5 font-bold">
          <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          <span>WebRTC Diagnostics</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-0.5 hover:text-rose-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-[10px]">
        <span className="text-white/60">Quality:</span>
        <span className={`font-bold capitalize ${qualityColor}`}>{stats.quality}</span>

        <span className="text-white/60">Resolution:</span>
        <span>
          {stats.resolution.width > 0 ? `${stats.resolution.width}x${stats.resolution.height}` : "Audio / N/A"}
        </span>

        <span className="text-white/60">FPS:</span>
        <span>{stats.fps > 0 ? `${stats.fps} fps` : "N/A"}</span>

        <span className="text-white/60">Bitrate:</span>
        <span>{stats.bitrateKbps} kbps</span>

        <span className="text-white/60">Packet Loss:</span>
        <span className={stats.packetLossPercent > 8 ? "text-rose-400 font-bold" : "text-white"}>
          {stats.packetLossPercent}%
        </span>

        <span className="text-white/60">RTT:</span>
        <span className={stats.rttMs > 400 ? "text-amber-400 font-bold" : "text-white"}>{stats.rttMs} ms</span>

        <span className="text-white/60">Candidate:</span>
        <span className="capitalize font-semibold text-rose-300">{stats.candidateType}</span>

        <span className="text-white/60">Scale Down:</span>
        <span>{stats.scaleResolutionDownBy}x</span>
      </div>

      {reconnectStatus && (
        <div className="pt-1 border-t border-white/10 text-amber-300 flex items-center gap-1 text-[10px]">
          <Wifi className="w-3 h-3 animate-spin" />
          <span>{reconnectStatus}</span>
        </div>
      )}
    </div>
  );
}
