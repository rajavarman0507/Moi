"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import MediaPermissionModal from "@/components/MediaPermissionModal";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Sparkles,
  ShieldCheck,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";

// Google's Free Public STUN Servers Config
// STUN-only P2P connections succeed across most residential broadband and Wi-Fi networks,
// but direct P2P connections can fail on strict/symmetric NATs (corporate networks, carrier NATs).
// TURN fallback is planned for Phase 11b.
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

interface CallData {
  status: "idle" | "ringing" | "active" | "rejected" | "ended" | "missed";
  callerId: string;
  calleeId: string;
  type: "audio" | "video";
  offer?: { type: RTCSdpType; sdp: string };
  answer?: { type: RTCSdpType; sdp: string };
  startedAt?: any;
  answeredAt?: any;
  endedAt?: any;
}

function CallContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, couple, partnerProfile, userProfile } = useAuth();
  const { online: partnerOnline } = usePartnerPresence();

  // Call State
  const [callData, setCallData] = useState<CallData | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Permission Modal State
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // WebRTC & DOM Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const coupleId = couple?.id;
  const myUid = user?.uid;
  const partnerUid = couple?.userIds?.find((id) => id !== myUid);

  const myName = userProfile?.displayName || "You";
  const partnerName = partnerProfile?.displayName || "Partner";

  // Check URL query parameters for auto-accept flow from IncomingCallOverlay
  const autoAcceptParam = searchParams.get("accept") === "true";
  const typeParam = searchParams.get("type") as "audio" | "video" | null;

  // 1. Subscribe to Firestore Call Signaling Document
  useEffect(() => {
    if (!coupleId || !myUid) return;

    const callDocRef = doc(db, "couples", coupleId, "call", "current");

    const unsubscribe = onSnapshot(callDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CallData;
        setCallData(data);

        if (data.status === "rejected") {
          setStatusMessage("Call declined by partner");
          cleanUpLocalMediaAndPeer();
        } else if (data.status === "ended") {
          setStatusMessage("Call ended");
          cleanUpLocalMediaAndPeer();
        } else if (data.status === "missed") {
          setStatusMessage("Missed call");
          cleanUpLocalMediaAndPeer();
        }
      } else {
        setCallData(null);
      }
    });

    return () => unsubscribe();
  }, [coupleId, myUid]);

  // 2. Format Active Call Duration Timer (MM:SS)
  useEffect(() => {
    if (callData?.status === "active") {
      if (!callTimerRef.current) {
        callTimerRef.current = setInterval(() => {
          setCallSeconds((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallSeconds(0);
    }

    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callData?.status]);

  // 3. Clean up ICE Candidate collection documents
  const deleteIceCandidatesSubcollection = async () => {
    if (!coupleId) return;
    try {
      const candidatesCollRef = collection(db, "couples", coupleId, "call", "current", "iceCandidates");
      const snap = await getDocs(candidatesCollRef);
      const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      console.error("Error deleting ICE candidates subcollection:", e);
    }
  };

  // 4. Local WebRTC & Stream Cleanup
  const cleanUpLocalMediaAndPeer = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    iceCandidateQueueRef.current = [];
  }, []);

  // Ensure cleanup on component unmount
  useEffect(() => {
    return () => cleanUpLocalMediaAndPeer();
  }, [cleanUpLocalMediaAndPeer]);

  // 5. Initialize Local RTCPeerConnection with STUN Servers
  const createPeerConnection = (targetCallType: "audio" | "video") => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionRef.current = pc;

    // Handle ICE Candidate Discovery -> Write to Firestore
    pc.onicecandidate = (event) => {
      if (event.candidate && coupleId && myUid) {
        const candidateData = event.candidate.toJSON();
        const candCollRef = collection(db, "couples", coupleId, "call", "current", "iceCandidates");
        addDoc(candCollRef, {
          ...candidateData,
          fromUserId: myUid,
          createdAt: serverTimestamp(),
        }).catch((e) => console.error("Error adding ICE candidate to Firestore:", e));
      }
    };

    // Handle Remote Stream Tracks
    pc.ontrack = (event) => {
      console.log("Remote track received:", event.streams);
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];

        if (targetCallType === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      }
    };

    return pc;
  };

  // 6. Listen to incoming ICE Candidates with Queuing / Buffering
  const listenToRemoteIceCandidates = (pc: RTCPeerConnection) => {
    if (!coupleId || !myUid) return;

    const candCollRef = collection(db, "couples", coupleId, "call", "current", "iceCandidates");
    return onSnapshot(candCollRef, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.fromUserId !== myUid) {
            const candidateInit: RTCIceCandidateInit = {
              candidate: data.candidate,
              sdpMid: data.sdpMid,
              sdpMLineIndex: data.sdpMLineIndex,
            };

            // ICE Candidate Buffering: Queue if remote description is not set yet!
            if (!pc.remoteDescription) {
              iceCandidateQueueRef.current.push(candidateInit);
            } else {
              pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch((e) =>
                console.error("Error adding remote ICE candidate:", e)
              );
            }
          }
        }
      });
    });
  };

  // Flush Buffered ICE Candidates after setRemoteDescription resolves
  const flushIceCandidateQueue = async (pc: RTCPeerConnection) => {
    while (iceCandidateQueueRef.current.length > 0) {
      const candidateInit = iceCandidateQueueRef.current.shift();
      if (candidateInit) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        } catch (e) {
          console.error("Error flushing queued ICE candidate:", e);
        }
      }
    }
  };

  // 7. CALLER FLOW: Initiate Call
  const initiateCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !partnerUid) return;

    try {
      // Glare Check: If partner already has a ringing call, switch to auto-accept!
      if (callData?.status === "ringing" && callData.callerId === partnerUid) {
        console.log("Glare detected: partner is already calling — switching to answer partner's call...");
        await executeAcceptCall(typeToUse);
        return;
      }

      setPermissionError(null);

      // Acquire Media Stream
      const constraints = {
        audio: true,
        video: typeToUse === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };

      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = localStream;

      if (typeToUse === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Create PeerConnection & Attach Local Tracks
      const pc = createPeerConnection(typeToUse);
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // Listen for Remote ICE Candidates
      listenToRemoteIceCandidates(pc);

      // Create SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Write Offer to Firestore couples/{coupleId}/call/current
      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      await setDoc(callDocRef, {
        status: "ringing",
        callerId: myUid,
        calleeId: partnerUid,
        type: typeToUse,
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        startedAt: serverTimestamp(),
      });

      setStatusMessage("Calling partner...");
      setShowPermissionModal(false);

      // 45-Second Caller Missed Call Timeout
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(async () => {
        if (peerConnectionRef.current) {
          console.log("Call unanswered for 45 seconds — setting status to missed...");
          await setDoc(
            callDocRef,
            { status: "missed", endedAt: serverTimestamp() },
            { merge: true }
          );
        }
      }, 45000);
    } catch (err: any) {
      console.error("Error initiating call:", err);
      setPermissionError("Camera/mic access is needed for calls — please enable it in browser settings.");
    }
  };

  // Handle Caller Remote Answer Listener
  useEffect(() => {
    if (callData?.status === "active" && callData.answer && peerConnectionRef.current) {
      const pc = peerConnectionRef.current;

      if (!pc.currentRemoteDescription) {
        const remoteAnswer = new RTCSessionDescription({
          type: callData.answer.type,
          sdp: callData.answer.sdp,
        });

        pc.setRemoteDescription(remoteAnswer)
          .then(() => {
            console.log("Caller set remote SDP answer successfully.");
            flushIceCandidateQueue(pc);
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            setStatusMessage(null);
          })
          .catch((e) => console.error("Error setting remote answer on caller:", e));
      }
    }
  }, [callData]);

  // 8. CALLEE FLOW: Execute Accept Call
  const executeAcceptCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !callData?.offer) return;

    try {
      setPermissionError(null);

      // Acquire Media Stream
      const constraints = {
        audio: true,
        video: typeToUse === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };

      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = localStream;

      if (typeToUse === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Create PeerConnection & Attach Local Tracks
      const pc = createPeerConnection(typeToUse);
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // Listen for Remote ICE Candidates
      listenToRemoteIceCandidates(pc);

      // Set Remote Description from Caller SDP Offer
      const remoteOffer = new RTCSessionDescription({
        type: callData.offer.type,
        sdp: callData.offer.sdp,
      });

      await pc.setRemoteDescription(remoteOffer);

      // Flush Queued ICE Candidates immediately!
      await flushIceCandidateQueue(pc);

      // Create SDP Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Write Answer to Firestore and set status to active
      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      await setDoc(
        callDocRef,
        {
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
          status: "active",
          answeredAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStatusMessage(null);
      setShowPermissionModal(false);
    } catch (err: any) {
      console.error("Error accepting call / getUserMedia failed:", err);
      setPermissionError("Camera/mic access is needed for calls — please enable it in browser settings.");

      // Permission-Denied After Accept Handler: Transition status to ended gracefully
      if (coupleId) {
        const callDocRef = doc(db, "couples", coupleId, "call", "current");
        setDoc(callDocRef, { status: "ended", endedAt: serverTimestamp() }, { merge: true }).catch(
          (e) => console.error(e)
        );
      }
    }
  };

  // Auto-Accept trigger if user navigated from IncomingCallOverlay
  useEffect(() => {
    if (autoAcceptParam && callData?.status === "ringing" && !peerConnectionRef.current) {
      const typeToUse = typeParam || callData.type || "video";
      setCallType(typeToUse);
      executeAcceptCall(typeToUse);
    }
  }, [autoAcceptParam, callData, typeParam]);

  // 9. Hang Up Action & State Hygiene
  const handleHangUp = async () => {
    if (!coupleId) return;

    try {
      cleanUpLocalMediaAndPeer();

      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      await setDoc(callDocRef, { status: "ended", endedAt: serverTimestamp() }, { merge: true });

      // Delete subcollection ICE candidates
      deleteIceCandidatesSubcollection();

      // Reset call/current to idle after 1.5s transition delay
      setTimeout(async () => {
        try {
          await setDoc(callDocRef, { status: "idle" });
        } catch (e) {}
      }, 1500);
    } catch (err) {
      console.error("Error hanging up call:", err);
    }
  };

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  // Toggle Camera Video
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isCameraOff;
        setIsCameraOff(!isCameraOff);
      }
    }
  };

  // Format seconds into MM:SS
  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isInCall = callData?.status === "ringing" || callData?.status === "active";

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] relative overflow-hidden rounded-3xl border border-rose-500/40 bg-[#16060E]/95 shadow-2xl">
      {/* Hidden Audio element for remote audio output */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Permission Pre-Prompt Modal */}
      <MediaPermissionModal
        isOpen={showPermissionModal}
        callType={callType}
        partnerName={partnerName}
        onConfirm={() => initiateCall(callType)}
        onCancel={() => setShowPermissionModal(false)}
        permissionError={permissionError}
      />

      {!isInCall ? (
        /* IDLE / PRE-CALL LAUNCHER VIEW */
        <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-rose-600 to-wine-600 flex items-center justify-center text-white shadow-glow relative">
            {partnerProfile?.photoUrl ? (
              <img
                src={partnerProfile.photoUrl}
                alt={partnerName}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <span className="text-3xl font-extrabold">{partnerName.slice(0, 2).toUpperCase()}</span>
            )}
            <span
              className={`absolute bottom-0 right-0 w-5 h-5 rounded-full border-2 border-[#16060E] ${
                partnerOnline ? "bg-emerald-400" : "bg-gray-500"
              }`}
            />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-white flex items-center justify-center gap-2">
              <span>Call {partnerName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>WebRTC P2P</span>
              </span>
            </h2>
            <p className="text-xs text-rose-300/70">
              {partnerOnline ? "Partner is online and ready for call" : "Partner is currently offline"}
            </p>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500/30 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 animate-pulse">
              <AlertCircle className="w-4 h-4 text-amber-300" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Launch Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm pt-4">
            <button
              onClick={() => {
                setCallType("video");
                setShowPermissionModal(true);
              }}
              className="moi-button-primary flex-1 py-4 text-xs font-extrabold flex items-center justify-center space-x-2"
            >
              <Video className="w-5 h-5" />
              <span>Start Video Call</span>
            </button>

            <button
              onClick={() => {
                setCallType("audio");
                setShowPermissionModal(true);
              }}
              className="moi-button-secondary flex-1 py-4 text-xs font-extrabold flex items-center justify-center space-x-2 border-rose-500/40"
            >
              <PhoneCall className="w-5 h-5 text-rose-400" />
              <span>Start Audio Call</span>
            </button>
          </div>
        </div>
      ) : callData?.type === "video" ? (
        /* ACTIVE VIDEO CALL UI */
        <div className="relative w-full h-full bg-[#0D0308] flex items-center justify-center overflow-hidden">
          {/* Remote Video (Full Screen) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Local Video Preview (Small Corner Floating Window) */}
          <div className="absolute top-4 right-4 w-32 h-44 sm:w-40 sm:h-56 rounded-2xl border-2 border-rose-500/50 bg-[#16060E] overflow-hidden shadow-2xl z-20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          {/* Top Status & Timer Overlay */}
          <div className="absolute top-4 left-4 z-20 flex items-center space-x-3 px-4 py-2 rounded-2xl bg-[#16060E]/80 backdrop-blur-md border border-rose-500/30">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold text-white">{partnerName}</span>
            <span className="text-xs font-mono text-rose-300/80 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span>{formatTimer(callSeconds)}</span>
            </span>
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-3xl bg-[#16060E]/90 backdrop-blur-xl border border-rose-500/40 flex items-center space-x-6 shadow-2xl">
            <button
              onClick={toggleMute}
              className={`p-3.5 rounded-2xl transition-all ${
                isMuted
                  ? "bg-rose-600 text-white"
                  : "bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30"
              }`}
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-3.5 rounded-2xl transition-all ${
                isCameraOff
                  ? "bg-rose-600 text-white"
                  : "bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30"
              }`}
              title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            <button
              onClick={handleHangUp}
              className="p-4 rounded-2xl bg-rose-700 hover:bg-rose-800 text-white shadow-lg transition-transform active:scale-95"
              title="Hang Up Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        /* ACTIVE AUDIO CALL UI */
        <div className="flex flex-col items-center justify-between h-full p-8 bg-gradient-to-b from-[#2B0A1A] via-[#1B0610] to-[#12040A]">
          <div className="pt-8 text-center space-y-4">
            <div className="w-32 h-32 rounded-full border-4 border-rose-500/40 bg-wine-900/80 mx-auto flex items-center justify-center text-white shadow-glow relative animate-pulse">
              {partnerProfile?.photoUrl ? (
                <img
                  src={partnerProfile.photoUrl}
                  alt={partnerName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-4xl font-extrabold">{partnerName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-extrabold text-white">{partnerName}</h2>
              <p className="text-sm font-mono text-rose-300/80 flex items-center justify-center gap-1.5 pt-1">
                <Clock className="w-4 h-4 text-rose-400" />
                <span>In Call • {formatTimer(callSeconds)}</span>
              </p>
            </div>
          </div>

          {/* Bottom Audio Control Bar */}
          <div className="pb-8 flex items-center space-x-6">
            <button
              onClick={toggleMute}
              className={`p-4 rounded-2xl transition-all ${
                isMuted
                  ? "bg-rose-600 text-white"
                  : "bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30"
              }`}
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            <button
              onClick={handleHangUp}
              className="p-5 rounded-2xl bg-rose-700 hover:bg-rose-800 text-white shadow-lg transition-transform active:scale-95"
              title="Hang Up Call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto flex items-center justify-center h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] rounded-3xl border border-rose-500/40 bg-[#16060E]/95 shadow-2xl">
          <div className="flex items-center space-x-3 text-rose-300">
            <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
            <span className="text-sm font-bold">Loading call screen...</span>
          </div>
        </div>
      }
    >
      <CallContent />
    </Suspense>
  );
}
