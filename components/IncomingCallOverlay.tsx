"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { Phone, PhoneOff, Video, Mic, Sparkles, Volume2 } from "lucide-react";
import { toneManager } from "@/lib/tones";

interface CallData {
  status: "idle" | "ringing" | "active" | "rejected" | "ended" | "missed";
  callerId: string;
  calleeId: string;
  type: "audio" | "video";
  offer?: any;
  answer?: any;
  startedAt?: any;
  endedAt?: any;
}

export default function IncomingCallOverlay() {
  const router = useRouter();
  const { user, couple, partnerProfile } = useAuth();
  const { online: partnerOnline } = usePartnerPresence();

  const [callData, setCallData] = useState<CallData | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showAutoplayBanner, setShowAutoplayBanner] = useState<boolean>(false);
  const notifiedCallIdRef = useRef<string | null>(null);

  const coupleId = couple?.id;
  const myUid = user?.uid;
  const partnerName = partnerProfile?.displayName || "Partner";

  // Subscribe to couples/{coupleId}/call/current
  useEffect(() => {
    if (!coupleId || !myUid) return;

    const callDocRef = doc(db, "couples", coupleId, "call", "current");

    const unsubscribe = onSnapshot(
      callDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CallData;
          setCallData(data);
        } else {
          setCallData(null);
        }
      },
      (err) => console.error("Incoming call listener error:", err)
    );

    return () => unsubscribe();
  }, [coupleId, myUid]);

  // Determine if incoming call modal should display on THIS client (strictly for callee)
  const isIncomingCall =
    callData?.status === "ringing" && callData?.calleeId === myUid;

  // 1. Synthesized Ringtone Playback for Callee
  useEffect(() => {
    if (isIncomingCall) {
      toneManager.startRingtone();
      if (toneManager.isAutoplayBlocked()) {
        setShowAutoplayBanner(true);
      }
    } else {
      toneManager.stopAllTones();
      setShowAutoplayBanner(false);
    }

    return () => {
      toneManager.stopAllTones();
    };
  }, [isIncomingCall]);

  const handleUnlockAudio = async () => {
    await toneManager.unlockAudioContext();
    setShowAutoplayBanner(false);
    if (isIncomingCall) {
      toneManager.startRingtone();
    }
  };

  // 2. Mandatory Notification Triggering on Incoming Ringing Call
  useEffect(() => {
    if (!isIncomingCall || !coupleId || !myUid || !callData?.callerId) return;

    const callIdentifier = `${callData.callerId}_${callData.startedAt?.seconds || Date.now()}`;
    if (notifiedCallIdRef.current === callIdentifier) return;
    notifiedCallIdRef.current = callIdentifier;

    // Trigger mandatory call notification (bypasses general notification preference toggles)
    const notifCollRef = collection(db, "couples", coupleId, "notifications");
    addDoc(notifCollRef, {
      toUserId: myUid,
      type: "call",
      title: `Incoming ${callData.type === "video" ? "Video" : "Audio"} Call`,
      body: `Incoming call from ${partnerName} 📞`,
      createdAt: serverTimestamp(),
      read: false,
    }).catch((e) => console.error("Error creating call notification:", e));
  }, [isIncomingCall, coupleId, myUid, callData, partnerName]);

  // 3. Redundant 45-Second Missed-Call & Caller RTDB Disconnect Recovery
  useEffect(() => {
    if (!isIncomingCall || !coupleId) return;

    // Check if startedAt was more than 45 seconds ago
    const startedMs = callData.startedAt?.toDate
      ? callData.startedAt.toDate().getTime()
      : Date.now();
    const elapsedSeconds = (Date.now() - startedMs) / 1000;

    if (elapsedSeconds > 45 || !partnerOnline) {
      console.log("Caller disconnected or 45s elapsed — auto-resetting call to missed...");
      toneManager.stopAllTones();
      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      setDoc(
        callDocRef,
        {
          status: "missed",
          endedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((e) => console.error("Error resetting missed call:", e));
    }
  }, [isIncomingCall, coupleId, callData, partnerOnline]);

  // 4. Handle Decline Action
  const handleDecline = async () => {
    if (!coupleId || isProcessing) return;
    setIsProcessing(true);
    toneManager.stopAllTones();

    try {
      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      await setDoc(
        callDocRef,
        {
          status: "rejected",
          endedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error declining call:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Handle Accept Action
  const handleAccept = async () => {
    if (!coupleId || isProcessing) return;
    setIsProcessing(true);
    toneManager.stopAllTones();

    try {
      // Redirect callee to /call page where RTCPeerConnection SDP Answer will be generated
      router.push(`/call?accept=true&type=${callData?.type || "video"}`);
    } catch (err) {
      console.error("Error accepting call:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isIncomingCall) return null;

  return (
    <div
      onClick={showAutoplayBanner ? handleUnlockAudio : undefined}
      className="fixed inset-0 bg-[#12040A]/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
    >
      <div className="moi-card p-8 max-w-sm w-full bg-gradient-to-br from-[#2D0B1E]/95 via-[#45122C]/95 to-[#1A0512]/95 border border-rose-500/50 space-y-6 text-center shadow-2xl relative overflow-hidden animate-pulse">
        {/* Autoplay Unlock Banner */}
        {showAutoplayBanner && (
          <button
            onClick={handleUnlockAudio}
            className="w-full py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 rounded-xl text-amber-200 text-xs font-bold flex items-center justify-center space-x-2 transition-colors animate-bounce"
          >
            <Volume2 className="w-4 h-4 text-amber-300" />
            <span>Tap anywhere to enable ringtone sound</span>
          </button>
        )}

        {/* Glowing Call Header Icon */}
        <div className="w-24 h-24 rounded-full border-4 border-rose-500/40 bg-wine-900/80 mx-auto flex items-center justify-center text-white relative shadow-glow">
          {partnerProfile?.photoUrl ? (
            <img
              src={partnerProfile.photoUrl}
              alt={partnerName}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span className="text-3xl font-extrabold">{partnerName.slice(0, 2).toUpperCase()}</span>
          )}
          <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-rose-600 text-white shadow-md">
            {callData?.type === "video" ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
          </div>
        </div>

        {/* Call Info */}
        <div className="space-y-1">
          <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-400/30 inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
            <span>Incoming {callData?.type === "video" ? "Video" : "Audio"} Call</span>
          </span>
          <h2 className="text-2xl font-extrabold text-white pt-2">{partnerName}</h2>
          <p className="text-xs text-rose-200/70">Ringing...</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-around pt-4 border-t border-rose-900/40">
          {/* Decline Button */}
          <button
            onClick={handleDecline}
            disabled={isProcessing}
            className="w-14 h-14 rounded-full bg-rose-700 hover:bg-rose-800 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
            title="Decline Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          {/* Accept Button */}
          <button
            onClick={handleAccept}
            disabled={isProcessing}
            className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 animate-bounce"
            title="Accept Call"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
