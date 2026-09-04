"use client";

import React from "react";
import { Camera, Mic, Video, ShieldAlert, ArrowRight, X } from "lucide-react";

interface MediaPermissionModalProps {
  isOpen: boolean;
  callType: "audio" | "video";
  partnerName: string;
  onConfirm: () => void;
  onCancel: () => void;
  permissionError: string | null;
}

export default function MediaPermissionModal({
  isOpen,
  callType,
  partnerName,
  onConfirm,
  onCancel,
  permissionError,
}: MediaPermissionModalProps) {
  if (!isOpen) return null;

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="moi-card p-6 md:p-8 max-w-md w-full bg-gradient-to-br from-[#290B1B]/95 via-[#3D1127]/95 to-[#1E0613]/95 border border-rose-500/40 text-center space-y-5 shadow-2xl relative overflow-hidden">
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-600 to-wine-600 mx-auto flex items-center justify-center text-white shadow-glow">
          {permissionError ? (
            <ShieldAlert className="w-8 h-8 text-amber-300" />
          ) : isVideo ? (
            <Video className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </div>

        {permissionError ? (
          /* Permission Error State */
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white">Device Access Needed</h3>
              <p className="text-xs text-amber-300 font-semibold leading-relaxed">
                Camera & microphone access is needed to connect calls.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-left space-y-2 text-xs text-amber-200">
              <p className="font-bold flex items-center gap-1.5 text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>How to enable in browser:</span>
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-amber-200/90 leading-relaxed">
                <li>Tap the lock / camera icon in your browser address bar.</li>
                <li>Allow Camera and Microphone permissions for this site.</li>
                <li>Reload the page and try calling again!</li>
              </ul>
            </div>

            <button
              onClick={onCancel}
              className="moi-button-secondary w-full py-3 text-xs font-extrabold"
            >
              Close & Go Back
            </button>
          </div>
        ) : (
          /* Pre-Prompt Explanation State */
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white">
                Start {isVideo ? "Video" : "Audio"} Call with {partnerName}?
              </h3>
              <p className="text-xs text-rose-200/80 leading-relaxed">
                {isVideo
                  ? "We need permission to access your camera and microphone so you and your partner can see and hear each other."
                  : "We need permission to access your microphone so you and your partner can talk."}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/20 text-left text-xs text-rose-200/90 space-y-2">
              <div className="flex items-center space-x-2 text-rose-300 font-bold">
                <Camera className="w-4 h-4 text-rose-400" />
                <span>Private Direct P2P Encryption</span>
              </div>
              <p className="text-[11px] text-rose-300/70 leading-relaxed">
                Your call streams directly between your browsers using WebRTC. Media feeds are never stored or logged on servers.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={onCancel}
                className="w-full sm:w-1/2 py-3 rounded-2xl border border-rose-500/30 text-rose-300 text-xs font-bold hover:bg-rose-950/50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="moi-button-primary w-full sm:w-1/2 py-3 text-xs font-extrabold flex items-center justify-center space-x-1.5"
              >
                <span>Allow & Connect</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
