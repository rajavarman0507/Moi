"use client";

import React from "react";
import { Activity, X, Wifi } from "lucide-react";
import { CallStatsSnapshot } from "@/lib/call/adaptiveQuality";

interface CallDebugOverlayProps {
  stats: CallStatsSnapshot | null;
  reconnectStatus?: string | null;
  signalingState?: string;
  iceConnectionState?: string;
  connectionState?: string;
  localTrackCount?: number;
  remoteTrackCount?: number;
  ontrackFired?: boolean;
  turnStatus?: string;
  remoteVideoHasSrc?: boolean;
  remoteVideoPlaying?: boolean;
  remoteAudioHasSrc?: boolean;
  remoteAudioPlaying?: boolean;
  firstErrorName?: string | null;
  onClose?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CallDebugOverlay({
  stats,
  reconnectStatus,
  signalingState = "unknown",
  iceConnectionState = "unknown",
  connectionState = "unknown",
  localTrackCount = 0,
  remoteTrackCount = 0,
  ontrackFired = false,
  turnStatus = "unfetched",
  remoteVideoHasSrc = false,
  remoteVideoPlaying = false,
  remoteAudioHasSrc = false,
  remoteAudioPlaying = false,
  firstErrorName = null,
  onClose,
}: CallDebugOverlayProps) {
  const qualityColor =
    stats?.quality === "good" ? "text-emerald-400" : stats?.quality === "fair" ? "text-amber-400" : "text-rose-400";

  return (
    <div className="absolute bottom-24 right-4 z-40 max-w-sm w-76 p-3.5 rounded-2xl bg-black/95 backdrop-blur-md border border-rose-500/40 text-white text-[11px] font-mono shadow-2xl space-y-2 select-none max-h-[75vh] overflow-y-auto">
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
        <span className="text-white/60">Signaling:</span>
        <span className="font-semibold text-rose-300">{signalingState}</span>

        <span className="text-white/60">ICE State:</span>
        <span className={iceConnectionState === "connected" ? "text-emerald-400 font-bold" : "text-amber-400"}>
          {iceConnectionState}
        </span>

        <span className="text-white/60">Peer Conn:</span>
        <span className="capitalize">{connectionState}</span>

        <span className="text-white/60">Tracks (L/R):</span>
        <span>{localTrackCount} / {remoteTrackCount}</span>

        <span className="text-white/60">ontrack fired:</span>
        <span className={ontrackFired ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
          {ontrackFired ? "YES" : "NO"}
        </span>

        <span className="text-white/60">/api/turn:</span>
        <span className="font-semibold text-rose-200">{turnStatus}</span>

        <span className="text-white/60">Remote Video:</span>
        <span>
          {remoteVideoHasSrc ? "srcObject: OK" : "no src"} ({remoteVideoPlaying ? "playing" : "paused"})
        </span>

        <span className="text-white/60">Remote Audio:</span>
        <span>
          {remoteAudioHasSrc ? "srcObject: OK" : "no src"} ({remoteAudioPlaying ? "playing" : "paused"})
        </span>

        {firstErrorName && (
          <>
            <span className="text-white/60">First Error:</span>
            <span className="text-rose-400 font-bold truncate">{firstErrorName}</span>
          </>
        )}

        {stats && (
          <>
            <span className="text-white/60">Ladder Level:</span>
            <span className="font-bold text-rose-300 truncate" title={stats.levelLabel}>
              {stats.levelLabel}
            </span>

            <span className="text-white/60">Candidate:</span>
            <span className="capitalize font-semibold text-rose-300">{stats.candidateType}</span>

            <span className="text-white/60">Avail Bitrate:</span>
            <span className="font-semibold text-emerald-300">
              {stats.availableOutgoingBitrateKbps > 0 ? `${stats.availableOutgoingBitrateKbps} kbps` : "N/A"}
            </span>

            <span className="text-white/60">Sent Bitrate:</span>
            <span>{stats.bitrateKbps} kbps</span>

            <span className="text-white/60">Quality:</span>
            <span className={`font-bold capitalize ${qualityColor}`}>{stats.quality}</span>

            <span className="text-white/60">Resolution:</span>
            <span>
              {stats.resolution.width > 0 ? `${stats.resolution.width}x${stats.resolution.height}` : "Audio/N/A"}
            </span>

            <span className="text-white/60">FPS / RTT / Jitter:</span>
            <span>{stats.fps} fps / {stats.rttMs} ms / {stats.jitterMs} ms</span>

            <span className="text-white/60">Packets Lost:</span>
            <span className={stats.packetLossPercent > 8 ? "text-rose-400 font-bold" : "text-white"}>
              {stats.packetLossPercent}% ({stats.packetsLostTotal})
            </span>

            <span className="text-white/60">Bytes Recv (A/V):</span>
            <span className="truncate">
              {formatBytes(stats.audioBytesReceived)} / {formatBytes(stats.videoBytesReceived)}
            </span>
          </>
        )}
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
