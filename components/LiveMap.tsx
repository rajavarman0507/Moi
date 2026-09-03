"use client";

import React from "react";
import { Navigation, ShieldAlert, Clock, MapPin } from "lucide-react";

interface LiveMapProps {
  partnerName: string;
  partnerLocation: { lat: number; lng: number; accuracy: number; lastUpdatedMs: number } | null;
  partnerIsStale: boolean;
  myLocation: { lat: number; lng: number; accuracy: number } | null;
  isSharing: boolean;
}

export default function LiveMap({
  partnerName,
  partnerLocation,
  partnerIsStale,
  myLocation,
  isSharing,
}: LiveMapProps) {

  const activeLat = partnerLocation && !partnerIsStale ? partnerLocation.lat : myLocation?.lat;
  const activeLng = partnerLocation && !partnerIsStale ? partnerLocation.lng : myLocation?.lng;

  // OpenStreetMap embed URL
  const mapEmbedUrl =
    activeLat && activeLng
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${activeLng - 0.01}%2C${activeLat - 0.01}%2C${activeLng + 0.01}%2C${activeLat + 0.01}&layer=mapnik&marker=${activeLat}%2C${activeLng}`
      : null;

  return (
    <div className="space-y-4">
      {/* Location Status Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Partner Location Pill */}
        <div className="p-4 rounded-2xl bg-wine-950/80 border border-rose-500/30 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-rose-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-rose-400" />
              <span>{partnerName}'s Location</span>
            </span>
            {partnerLocation && !partnerIsStale ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">Live 🟢</span>
            ) : partnerLocation && partnerIsStale ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">Stale 🟡</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px]">Not Sharing 🔴</span>
            )}
          </div>

          <p className="text-xs text-rose-100/90 font-medium">
            {partnerLocation && !partnerIsStale ? (
              `Lat: ${partnerLocation.lat.toFixed(4)}, Lng: ${partnerLocation.lng.toFixed(4)}`
            ) : partnerLocation && partnerIsStale ? (
              <span className="text-amber-200/80">Location stale (No update in 2+ mins)</span>
            ) : (
              `${partnerName} is not currently sharing location`
            )}
          </p>
        </div>

        {/* Self Location Pill */}
        <div className="p-4 rounded-2xl bg-wine-950/80 border border-rose-500/30 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-rose-300 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-teal-400" />
              <span>Your Location</span>
            </span>
            {isSharing ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">Sharing 🟢</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px]">Off 🔴</span>
            )}
          </div>

          <p className="text-xs text-rose-100/90 font-medium">
            {isSharing && myLocation ? (
              `Lat: ${myLocation.lat.toFixed(4)}, Lng: ${myLocation.lng.toFixed(4)}`
            ) : isSharing ? (
              <span className="animate-pulse text-amber-200">Acquiring GPS coordinates...</span>
            ) : (
              "Toggle ON below to start sharing"
            )}
          </p>
        </div>
      </div>

      {/* Map Display Container */}
      <div className="relative w-full aspect-video rounded-3xl bg-[#180611] border border-rose-500/40 overflow-hidden shadow-2xl">
        {mapEmbedUrl ? (
          <iframe
            title="Live Location Map"
            src={mapEmbedUrl}
            className="w-full h-full border-0 filter contrast-125 brightness-90"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300 shadow-glow">
              <MapPin className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">No Live Coordinates Available</h4>
            <p className="text-xs text-rose-200/70 max-w-sm">
              Either you or {partnerName} need to turn on live location sharing to view positions on the map.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
