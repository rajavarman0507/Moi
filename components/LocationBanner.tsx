"use client";

import React from "react";
import { useLocationSharing } from "@/context/LocationContext";
import { useAuth } from "@/context/AuthContext";
import { Navigation, StopCircle } from "lucide-react";

export default function LocationBanner() {
  const { isSharing, sharingStartedAt, toggleSharing } = useLocationSharing();
  const { partnerProfile } = useAuth();

  if (!isSharing) return null;

  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "your partner";

  return (
    <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 text-white px-4 py-2.5 shadow-lg flex items-center justify-between z-50 text-xs border-b border-emerald-400/40">
      <div className="flex items-center space-x-2.5 font-bold">
        <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
        <Navigation className="w-4 h-4 text-emerald-200 animate-pulse" />
        <span>
          Sharing your live location with {partnerName} since {sharingStartedAt || "just now"}
        </span>
      </div>

      <button
        onClick={toggleSharing}
        className="px-3 py-1 rounded-xl bg-wine-950/80 hover:bg-wine-900 border border-rose-400/40 text-[11px] font-extrabold text-rose-200 flex items-center space-x-1 transition-colors shadow-sm"
      >
        <StopCircle className="w-3.5 h-3.5 text-rose-400" />
        <span>Tap to Stop</span>
      </button>
    </div>
  );
}
