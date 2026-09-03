"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocationSharing } from "@/context/LocationContext";
import LiveMap from "@/components/LiveMap";
import { Navigation, Sparkles, ShieldCheck, MapPin, StopCircle } from "lucide-react";

export default function LocationPage() {
  const { user, couple, partnerProfile, loading } = useAuth();
  const {
    isSharing,
    sharingStartedAt,
    toggleSharing,
    partnerLocation,
    partnerIsStale,
    myLocation,
    error,
  } = useLocationSharing();

  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Location Sharing...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Live Location Sharing</span>
            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            Share your real-time GPS position exclusively with {partnerName}.
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow self-start md:self-auto">
          <Navigation className="w-4 h-4 text-teal-400" />
          <span>Strict Couple Privacy</span>
        </div>
      </div>

      {/* Explicit Location Sharing Control Toggle Card */}
      <div className="moi-card p-6 md:p-8 bg-gradient-to-br from-[#290B1B]/95 via-[#3D1127]/95 to-[#1E0613]/95 border border-rose-500/40 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-2 flex-1">
          <div className="flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isSharing ? "bg-emerald-400 animate-ping" : "bg-rose-500"
              }`}
            />
            <h3 className="text-lg font-bold text-white">
              {isSharing
                ? `Sharing Live Location with ${partnerName}`
                : `Location Sharing is OFF`}
            </h3>
          </div>

          <p className="text-xs text-rose-200/70 leading-relaxed">
            {isSharing
              ? `Started sharing at ${sharingStartedAt || "just now"}. Your position updates every ~30s. A persistent banner will remind you on all pages.`
              : `Your position is private and not being shared. Toggle ON below whenever you want ${partnerName} to see where you are.`}
          </p>

          {error && <p className="text-xs font-bold text-rose-400 mt-1">{error}</p>}
        </div>

        {/* Toggle Button */}
        <button
          onClick={toggleSharing}
          className={`px-8 py-4 rounded-2xl text-xs font-extrabold flex items-center space-x-2 transition-all shadow-glow shrink-0 ${
            isSharing
              ? "bg-rose-950 border border-rose-400/40 text-rose-200 hover:bg-rose-900"
              : "moi-button-primary"
          }`}
        >
          {isSharing ? (
            <>
              <StopCircle className="w-4 h-4 text-rose-400" />
              <span>Stop Sharing Location</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              <span>Share My Live Location with {partnerName}</span>
            </>
          )}
        </button>
      </div>

      {/* Live Map Component */}
      <LiveMap
        partnerName={partnerName}
        partnerLocation={partnerLocation}
        partnerIsStale={partnerIsStale}
        myLocation={myLocation}
        isSharing={isSharing}
      />

      {/* Security Guarantee Note */}
      <div className="p-4 rounded-2xl bg-wine-950/60 border border-rose-500/20 text-xs text-rose-300/70 flex items-center space-x-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <p className="leading-relaxed">
          <span className="font-bold text-rose-200">Zero History Tracking Guarantee:</span> Only your latest written coordinates are stored. Turning sharing OFF immediately deletes your location document from the database.
        </p>
      </div>
    </div>
  );
}
