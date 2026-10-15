"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import MediaPermissionModal from "@/components/MediaPermissionModal";
import CallDebugOverlay from "@/components/CallDebugOverlay";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  addDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { toneManager } from "@/lib/tones";
import { loadYouTubeIframeApi } from "@/lib/youtubeApiLoader";
import { fetchRtcConfig, DEFAULT_RTC_CONFIG, getLastTurnHttpStatus } from "@/lib/call/rtcConfig";
import {
  IDEAL_AUDIO_CONSTRAINTS,
  IDEAL_VIDEO_CONSTRAINTS_USER,
  FALLBACK_VIDEO_CONSTRAINTS,
  applyTrackContentHints,
  configureAudioSender,
  configureVideoSender,
  preferVp8VideoCodec,
  optimizeOpusSdp,
} from "@/lib/call/mediaConstraints";
import { AdaptiveQualityController, CallStatsSnapshot } from "@/lib/call/adaptiveQuality";
import { wakeLockController } from "@/lib/call/wakeLock";
import { CALL_DEBUG_ENABLED, devLog, callWarn, callError } from "@/lib/call/debug";
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
  Volume2,
  Headphones,
  Settings2,
  RefreshCw,
  X,
  Check,
  SwitchCamera,
  Activity,
} from "lucide-react";

interface CallData {
  status: "idle" | "ringing" | "active" | "rejected" | "ended" | "missed";
  callerId: string;
  calleeId: string;
  type: "audio" | "video";
  offer?: { type: RTCSdpType; sdp: string };
  answer?: { type: RTCSdpType; sdp: string };
  renegotiationAt?: any;
  renegotiationBy?: string;
  renegotiationAnswerAt?: any;
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
  const [reconnectBanner, setReconnectBanner] = useState<string | null>(null);
  const [isSwappedView, setIsSwappedView] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Streams State for React DOM binding
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Permission Modal State
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Device Management State
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>("");
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");
  const [showDeviceSettings, setShowDeviceSettings] = useState<boolean>(false);

  // Diagnostics & Quality Stats
  const [callStats, setCallStats] = useState<CallStatsSnapshot | null>(null);
  const [showDebugOverlay, setShowDebugOverlay] = useState<boolean>(CALL_DEBUG_ENABLED);
  const [signalingState, setSignalingState] = useState<string>("idle");
  const [iceConnectionState, setIceConnectionState] = useState<string>("new");
  const [peerConnectionState, setPeerConnectionState] = useState<string>("new");
  const [ontrackFired, setOntrackFired] = useState<boolean>(false);
  const [firstErrorName, setFirstErrorName] = useState<string | null>(null);
  const [showAudioUnlockButton, setShowAudioUnlockButton] = useState<boolean>(false);

  // WebRTC & DOM Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const iceDisconnectedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iceRestartAttemptsRef = useRef<number>(0);
  const adaptiveControllerRef = useRef<AdaptiveQualityController | null>(null);

  // Perfect Negotiation State Refs
  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  const isSettingRemoteAnswerPendingRef = useRef<boolean>(false);
  const lastAppliedOfferRef = useRef<string | null>(null);
  const lastAppliedAnswerRef = useRef<string | null>(null);
  // Initial handshake guard: callee must never create an offer during the initial handshake
  const isInitialHandshakePendingRef = useRef<boolean>(true);

  // Pre-Call Live Camera Preview State & Refs
  const [preCallPreviewActive, setPreCallPreviewActive] = useState<boolean>(false);
  const preCallStreamRef = useRef<MediaStream | null>(null);
  const preCallVideoRef = useRef<HTMLVideoElement | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callerTuneYtPlayerRef = useRef<any>(null);

  const [callerTuneTrack, setCallerTuneTrack] = useState<{ videoId: string; clipStartSec: number; clipDurationSec: number } | null>(null);

  const coupleId = couple?.id;
  const myUid = user?.uid;
  const partnerUid = couple?.userIds?.find((id) => id !== myUid);

  // Root Cause Fix 1: Derive polite role directly from call document (callee is polite, caller is impolite)
  // This never depends on asynchronous partner profile loading
  const polite = Boolean(callData && myUid && callData.calleeId === myUid);

  const myName = userProfile?.displayName || "You";
  const partnerName = partnerProfile?.displayName || "Partner";

  // Check URL query parameters for auto-accept flow from IncomingCallOverlay
  const autoAcceptParam = searchParams.get("accept") === "true";
  const typeParam = searchParams.get("type") as "audio" | "video" | null;

  // 1. Enumerate Media Devices (Microphones, Headphones, Bluetooth, Cameras)
  const refreshMediaDevices = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      setAudioInputDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);
      setVideoInputDevices(videoInputs);

      // Auto-detect Bluetooth headset / headphones if present and not manually selected
      if (!selectedAudioOutput && audioOutputs.length > 0) {
        const bluetoothOrHeadset = audioOutputs.find(
          (d) =>
            d.label.toLowerCase().includes("bluetooth") ||
            d.label.toLowerCase().includes("headphone") ||
            d.label.toLowerCase().includes("headset") ||
            d.label.toLowerCase().includes("earphone")
        );
        if (bluetoothOrHeadset) {
          setSelectedAudioOutput(bluetoothOrHeadset.deviceId);
        } else {
          setSelectedAudioOutput(audioOutputs[0].deviceId);
        }
      }

      if (!selectedAudioInput && audioInputs.length > 0) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
      if (!selectedVideoInput && videoInputs.length > 0) {
        setSelectedVideoInput(videoInputs[0].deviceId);
      }
    } catch (err) {
      callError("Error enumerating media devices:", err);
    }
  }, [selectedAudioInput, selectedAudioOutput, selectedVideoInput]);

  useEffect(() => {
    refreshMediaDevices();
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", refreshMediaDevices);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", refreshMediaDevices);
      };
    }
  }, [refreshMediaDevices]);

  // 2. Change Audio Output Sink ID (Bluetooth / Speakers / Earphones Routing)
  const applyAudioOutputDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioOutput(deviceId);
      try {
        if (remoteAudioRef.current && "setSinkId" in remoteAudioRef.current) {
          await (remoteAudioRef.current as any).setSinkId(deviceId);
        }
      } catch (err) {
        callError("Error setting audio output sink ID:", err);
      }
    },
    []
  );

  // 3. Change Audio Input Microphone Live Mid-Call
  const changeAudioInputDevice = async (deviceId: string) => {
    setSelectedAudioInput(deviceId);
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...IDEAL_AUDIO_CONSTRAINTS,
          deviceId: { exact: deviceId },
        },
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.contentHint = "speech";
      newTrack.enabled = !isMuted;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newTrack);
          await configureAudioSender(sender);
        }
      }

      const oldTrack = localStreamRef.current.getAudioTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      callError("Error switching microphone device:", err);
    }
  };

  // 4. Change Video Input Camera Live Mid-Call
  const changeVideoInputDevice = async (deviceId: string) => {
    setSelectedVideoInput(deviceId);
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          deviceId: { exact: deviceId },
        },
      });

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.contentHint = "motion";
      newTrack.enabled = !isCameraOff;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newTrack);
          await configureVideoSender(sender);
        }
      }

      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      callError("Error switching camera device:", err);
    }
  };

  // 5. Flip Camera (Front <-> Rear Facing Mode)
  const flipCamera = async () => {
    const targetFacing = facingMode === "user" ? "environment" : "user";

    // Handle camera flip during pre-call camera preview
    if (preCallPreviewActive && preCallStreamRef.current && !localStreamRef.current) {
      try {
        preCallStreamRef.current.getTracks().forEach((t) => t.stop());
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 20, max: 24 },
            facingMode: { ideal: targetFacing },
          },
        });
        preCallStreamRef.current = newStream;
        if (preCallVideoRef.current) {
          preCallVideoRef.current.srcObject = newStream;
          preCallVideoRef.current.play().catch(() => {});
        }
        setFacingMode(targetFacing);
        devLog("Pre-call camera flipped to facingMode:", targetFacing);
      } catch (err) {
        callError("Error flipping pre-call preview camera:", err);
      }
      return;
    }

    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 20, max: 24 },
          facingMode: { ideal: targetFacing },
        },
      });

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.contentHint = "motion";
      newTrack.enabled = !isCameraOff;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newTrack);
          await configureVideoSender(sender);
        }
      }

      if (adaptiveControllerRef.current) {
        adaptiveControllerRef.current.setLocalVideoTrack(newTrack, isCameraOff);
      }

      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setFacingMode(targetFacing);
      devLog("Camera flipped to facingMode:", targetFacing);
    } catch (err) {
      callError("Error flipping camera:", err);
    }
  };

  // Pre-Call Live Camera Preview Toggle
  const togglePreCallPreview = async () => {
    if (preCallPreviewActive) {
      if (preCallStreamRef.current) {
        preCallStreamRef.current.getTracks().forEach((t) => t.stop());
        preCallStreamRef.current = null;
      }
      setPreCallPreviewActive(false);
    } else {
      try {
        const stream = await acquireLocalMediaStream("video");
        preCallStreamRef.current = stream;
        setPreCallPreviewActive(true);
      } catch (e) {
        callError("Error starting pre-call camera preview:", e);
      }
    }
  };

  // Bind pre-call video element
  useEffect(() => {
    if (preCallPreviewActive && preCallVideoRef.current && preCallStreamRef.current) {
      preCallVideoRef.current.srcObject = preCallStreamRef.current;
      preCallVideoRef.current.play().catch((e) => devLog("Pre-call preview play note:", e));
    }
  }, [preCallPreviewActive, facingMode]);

  // 6. Subscribe to Firestore Call Signaling Document
  useEffect(() => {
    if (!coupleId || !myUid) return;

    const callDocRef = doc(db, "couples", coupleId, "call", "current");

    const unsubscribe = onSnapshot(callDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CallData;
        setCallData(data);
        if (data.type) {
          setCallType(data.type);
        }

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

  // 7. Bind Local Stream to Local Video Ref
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch((err) => devLog("Local video play notice:", err));
    }
  }, [localStream, callData?.status, callData?.type, callType, isSwappedView]);

  // 8. Bind Remote Stream to Remote Video and Remote Audio Refs (Strict single-audio playback)
  useEffect(() => {
    if (!remoteStream) return;

    const activeType = callData?.type || callType;

    // Remote Video element is ALWAYS muted to prevent duplicate audio / acoustic echo
    if (activeType === "video" && remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.muted = true;
      remoteVideoRef.current.play().catch((err) => {
        devLog("Remote video play notice:", err);
        setShowAudioUnlockButton(true);
      });
    }

    // Remote Audio element handles single remote audio playback
    if (remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.play().catch((err) => {
        callWarn("Remote audio autoplay blocked by browser policy:", err);
        setShowAudioUnlockButton(true);
      });
    }

    if (selectedAudioOutput) {
      applyAudioOutputDevice(selectedAudioOutput);
    }
  }, [remoteStream, callData?.status, callData?.type, callType, isSwappedView, selectedAudioOutput, applyAudioOutputDevice]);

  // Audio Playback Unlock Action (for user gesture after browser autoplay rejection)
  const handleUnlockAudio = async () => {
    try {
      if (remoteAudioRef.current) {
        await remoteAudioRef.current.play();
      }
      if (remoteVideoRef.current) {
        await remoteVideoRef.current.play();
      }
      setShowAudioUnlockButton(false);
    } catch (e) {
      callError("Error unlocking audio playback:", e);
    }
  };

  // 9. Format Active Call Duration Timer (MM:SS) & Wake Lock
  useEffect(() => {
    if (callData?.status === "active") {
      wakeLockController.acquire();
      if (!callTimerRef.current) {
        callTimerRef.current = setInterval(() => {
          setCallSeconds((prev) => prev + 1);
        }, 1000);
      }
    } else {
      wakeLockController.release();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallSeconds(0);
    }

    return () => {
      wakeLockController.release();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callData?.status]);

  // 10. Clean up ICE Candidate collection documents
  const deleteIceCandidatesSubcollection = async () => {
    if (!coupleId) return;
    try {
      const candidatesCollRef = collection(db, "couples", coupleId, "call", "current", "iceCandidates");
      const snap = await getDocs(candidatesCollRef);
      const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      callError("Error deleting ICE candidates subcollection:", e);
    }
  };

  // 11. Local WebRTC & Stream Cleanup
  const cleanUpLocalMediaAndPeer = useCallback(() => {
    wakeLockController.release();

    if (adaptiveControllerRef.current) {
      adaptiveControllerRef.current.stop();
      adaptiveControllerRef.current = null;
    }

    if (iceDisconnectedTimerRef.current) {
      clearTimeout(iceDisconnectedTimerRef.current);
      iceDisconnectedTimerRef.current = null;
    }
    iceRestartAttemptsRef.current = 0;
    setReconnectBanner(null);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    remoteStreamRef.current = null;
    setRemoteStream(null);
    iceCandidateQueueRef.current = [];
    setCallStats(null);

    // Reset perfect negotiation tracking refs
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    isSettingRemoteAnswerPendingRef.current = false;
    lastAppliedOfferRef.current = null;
    lastAppliedAnswerRef.current = null;
    isInitialHandshakePendingRef.current = true;
    setShowAudioUnlockButton(false);

    // Reset pre-call preview stream
    if (preCallStreamRef.current) {
      preCallStreamRef.current.getTracks().forEach((t) => t.stop());
      preCallStreamRef.current = null;
    }
    setPreCallPreviewActive(false);
  }, []);

  // Ensure cleanup on component unmount
  useEffect(() => {
    return () => cleanUpLocalMediaAndPeer();
  }, [cleanUpLocalMediaAndPeer]);

  // 12. Initialize Local RTCPeerConnection with STUN / TURN Servers & ICE State Watchdog
  const createPeerConnection = async (targetCallType: "audio" | "video") => {
    let pc: RTCPeerConnection;
    try {
      const config = await fetchRtcConfig(user ? () => user.getIdToken() : undefined);
      pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;
    } catch (err: any) {
      setFirstErrorName((prev) => prev || err?.name || "PeerConnectionInitError");
      callError("Failed to instantiate RTCPeerConnection:", err);
      // Fallback with default STUN configuration
      pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      peerConnectionRef.current = pc;
    }

    setSignalingState(pc.signalingState);
    setIceConnectionState(pc.iceConnectionState);
    setPeerConnectionState(pc.connectionState);

    pc.onsignalingstatechange = () => {
      setSignalingState(pc.signalingState);
    };

    pc.onconnectionstatechange = () => {
      setPeerConnectionState(pc.connectionState);
    };

    // Initialize adaptive quality controller safely
    try {
      const controller = new AdaptiveQualityController(
        pc,
        (stats) => {
          setCallStats(stats);
        },
        () => {
          // If remote tracks exist but no packets are arriving for 5 seconds, show "Connection problem" and trigger an ICE restart
          callWarn("No inbound packets arriving for 5s — triggering recovery ICE restart...");
          setReconnectBanner("Connection problem");
          if (iceRestartAttemptsRef.current < 3) {
            iceRestartAttemptsRef.current++;
            try {
              if ("restartIce" in pc) {
                pc.restartIce();
              }
            } catch (e) {
              callError("Error triggering restartIce on stalled media:", e);
            }
          }
        },
        () => {
          setReconnectBanner((prev) => (prev === "Connection problem" ? null : prev));
        }
      );
      adaptiveControllerRef.current = controller;
    } catch (e) {
      callWarn("Adaptive controller init note:", e);
    }

    // Prefer VP8 video codec where supported
    preferVp8VideoCodec(pc);

    // Handle ICE Candidate Discovery -> Write to Firestore
    pc.onicecandidate = (event) => {
      if (event.candidate && coupleId && myUid) {
        const candidateData = event.candidate.toJSON();
        const candCollRef = collection(db, "couples", coupleId, "call", "current", "iceCandidates");
        addDoc(candCollRef, {
          ...candidateData,
          fromUserId: myUid,
          createdAt: serverTimestamp(),
        }).catch((e) => callError("Error adding ICE candidate to Firestore:", e));
      }
    };

    // Handle Remote Stream Tracks
    pc.ontrack = (event) => {
      setOntrackFired(true);
      devLog("Remote track received:", event.track.kind);

      let targetStream: MediaStream;
      if (event.streams && event.streams[0]) {
        targetStream = event.streams[0];
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        if (!remoteStreamRef.current.getTracks().some((t) => t.id === event.track.id)) {
          remoteStreamRef.current.addTrack(event.track);
        }
        targetStream = new MediaStream(remoteStreamRef.current.getTracks());
      }
      remoteStreamRef.current = targetStream;
      setRemoteStream(targetStream);

      // Once ontrack fires, attach stream to remote <video> (muted) and single remote <audio>, call play() on both
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = targetStream;
        remoteVideoRef.current.muted = true;
        remoteVideoRef.current.play().catch(() => setShowAudioUnlockButton(true));
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = targetStream;
        remoteAudioRef.current.play().catch(() => setShowAudioUnlockButton(true));
      }
    };

    // Connection state & ICE connection state handlers (Self-healing ICE Restart)
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      setIceConnectionState(state);
      devLog("ICE Connection State changed:", state);

      if (state === "connected" || state === "completed") {
        setReconnectBanner(null);
        iceRestartAttemptsRef.current = 0;
        if (iceDisconnectedTimerRef.current) {
          clearTimeout(iceDisconnectedTimerRef.current);
          iceDisconnectedTimerRef.current = null;
        }

        // Apply sender parameters only after connection is established, inside try/catch
        pc.getSenders().forEach((sender) => {
          try {
            if (sender.track?.kind === "audio") {
              configureAudioSender(sender).catch(() => {});
            } else if (sender.track?.kind === "video") {
              configureVideoSender(sender).catch(() => {});
            }
          } catch (e) {}
        });

        // Start adaptive quality monitor inside try/catch
        try {
          if (adaptiveControllerRef.current) {
            adaptiveControllerRef.current.start();
          }
        } catch (e) {}
      } else if (state === "disconnected") {
        setReconnectBanner("Reconnecting...");
        if (!iceDisconnectedTimerRef.current) {
          iceDisconnectedTimerRef.current = setTimeout(async () => {
            if (pc.iceConnectionState === "disconnected") {
              if (iceRestartAttemptsRef.current < 3) {
                iceRestartAttemptsRef.current++;
                setReconnectBanner(`Reconnecting... (attempt ${iceRestartAttemptsRef.current} of 3)`);
                callWarn(`ICE disconnected for >3s — triggering ICE restart (attempt ${iceRestartAttemptsRef.current})...`);
                try {
                  if ("restartIce" in pc) {
                    pc.restartIce();
                  }
                } catch (e) {
                  callError("Error triggering restartIce on disconnected:", e);
                }
                if (iceDisconnectedTimerRef.current) {
                  clearTimeout(iceDisconnectedTimerRef.current);
                  iceDisconnectedTimerRef.current = null;
                }
              } else {
                setReconnectBanner("Connection lost. Ending call...");
                setTimeout(() => {
                  handleHangUp();
                }, 2000);
              }
            }
          }, 3000);
        }
      } else if (state === "failed") {
        if (iceRestartAttemptsRef.current < 3) {
          iceRestartAttemptsRef.current++;
          setReconnectBanner(`Reconnecting... (attempt ${iceRestartAttemptsRef.current} of 3)`);
          callWarn(`ICE failed — attempting recovery ICE restart (attempt ${iceRestartAttemptsRef.current})...`);
          try {
            if ("restartIce" in pc) {
              pc.restartIce();
            }
          } catch (e) {
            callError("Error triggering restartIce on failed:", e);
          }
        } else {
          setReconnectBanner("Connection failed. Ending call...");
          setTimeout(() => {
            handleHangUp();
          }, 2000);
        }
      }
    };

    // Perfect Negotiation: Handle onnegotiationneeded for in-call renegotiation
    pc.onnegotiationneeded = async () => {
      // The callee must never create an offer during the initial handshake!
      // Only handle renegotiations during an already active call where initial handshake has completed.
      if (callData?.status !== "active" || isInitialHandshakePendingRef.current || makingOfferRef.current) return;

      try {
        devLog("pc.onnegotiationneeded triggered. Current signaling state:", pc.signalingState);
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
          devLog("Signaling state changed while creating offer; skipping setLocalDescription");
          return;
        }
        const boostedSdp = optimizeOpusSdp(offer.sdp);
        await pc.setLocalDescription(new RTCSessionDescription({ type: offer.type, sdp: boostedSdp || offer.sdp }));

        if (coupleId && myUid) {
          const callDocRef = doc(db, "couples", coupleId, "call", "current");
          await setDoc(
            callDocRef,
            {
              offer: {
                type: pc.localDescription!.type,
                sdp: pc.localDescription!.sdp,
              },
              renegotiationAt: Date.now(),
              renegotiationBy: myUid,
            },
            { merge: true }
          );
          devLog("Renegotiation offer set locally and posted to Firestore.");
        }
      } catch (err: any) {
        setFirstErrorName((prev) => prev || err?.name || "NegotiationError");
        callError("Error in onnegotiationneeded handler:", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  };

  // 13. Listen to incoming ICE Candidates with Queuing / Buffering
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

            // Always buffer candidates until the remote description exists, then add them.
            if (!pc.remoteDescription) {
              iceCandidateQueueRef.current.push(candidateInit);
            } else {
              pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch((e: any) => {
                // Ignore an addIceCandidate error only while ignoreOffer is true
                if (ignoreOfferRef.current) {
                  devLog("addIceCandidate error ignored during colliding offer:", e?.name);
                  return;
                }
                callError("Error adding remote ICE candidate:", e);
              });
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
        } catch (e: any) {
          // Ignore an addIceCandidate error only while ignoreOffer is true
          if (ignoreOfferRef.current) {
            devLog("Queued addIceCandidate error ignored during colliding offer:", e?.name);
          } else {
            callError("Error flushing queued ICE candidate:", e);
          }
        }
      }
    }
  };

  // Acquire Media Stream helper starting at 640x360 ideal (20-24fps), fallback to 320x240 (never 720p)
  const acquireLocalMediaStream = async (typeToUse: "audio" | "video"): Promise<MediaStream> => {
    const audioConstraint = selectedAudioInput
      ? { ...IDEAL_AUDIO_CONSTRAINTS, deviceId: { exact: selectedAudioInput } }
      : IDEAL_AUDIO_CONSTRAINTS;

    if (typeToUse === "audio") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
      applyTrackContentHints(stream);
      return stream;
    }

    const videoConstraint360p: MediaTrackConstraints = selectedVideoInput
      ? { ...IDEAL_VIDEO_CONSTRAINTS_USER, deviceId: { exact: selectedVideoInput }, facingMode: undefined }
      : { ...IDEAL_VIDEO_CONSTRAINTS_USER, facingMode: facingMode };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: videoConstraint360p });
      applyTrackContentHints(stream);
      return stream;
    } catch (err) {
      callWarn("360p ideal constraint failed/overconstrained, falling back to 320x240:", err);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: FALLBACK_VIDEO_CONSTRAINTS });
      applyTrackContentHints(stream);
      return stream;
    }
  };

  // 14. CALLER FLOW: Initiate Call
  const initiateCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !partnerUid) return;

    try {
      await toneManager.unlockAudioContext();
      setCallType(typeToUse);

      if (callData?.status === "ringing" && callData.callerId === partnerUid) {
        devLog("Glare detected: partner is already calling — switching to answer partner's call...");
        await executeAcceptCall(typeToUse);
        return;
      }

      setPermissionError(null);

      // Fetch partner's caller tune preference
      try {
        const partnerUserDocRef = doc(db, "users", partnerUid);
        const partnerSnap = await getDoc(partnerUserDocRef);
        if (partnerSnap.exists() && partnerSnap.data()?.callerTune?.videoId) {
          const tune = partnerSnap.data().callerTune;
          setCallerTuneTrack({
            videoId: tune.videoId,
            clipStartSec: tune.clipStartSec || 0,
            clipDurationSec: tune.clipDurationSec || 20,
          });
        } else {
          setCallerTuneTrack(null);
        }
      } catch (e) {
        callWarn("Could not fetch partner caller tune:", e);
        setCallerTuneTrack(null);
      }

      if (preCallStreamRef.current) {
        preCallStreamRef.current.getTracks().forEach((t) => t.stop());
        preCallStreamRef.current = null;
      }
      setPreCallPreviewActive(false);

      const stream = await acquireLocalMediaStream(typeToUse);
      localStreamRef.current = stream;
      setLocalStream(stream);

      refreshMediaDevices();

      makingOfferRef.current = true;
      isInitialHandshakePendingRef.current = true;
      const pc = await createPeerConnection(typeToUse);
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === "video" && adaptiveControllerRef.current) {
          adaptiveControllerRef.current.setVideoSender(sender);
          adaptiveControllerRef.current.setLocalVideoTrack(track, isCameraOff);
        }
      });
      preferVp8VideoCodec(pc);

      listenToRemoteIceCandidates(pc);

      const rawOffer = await pc.createOffer();
      const boostedSdp = optimizeOpusSdp(rawOffer.sdp);
      const offer = new RTCSessionDescription({ type: rawOffer.type, sdp: boostedSdp });
      await pc.setLocalDescription(offer);
      lastAppliedOfferRef.current = offer.sdp;
      makingOfferRef.current = false;

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

      setStatusMessage("Ringing...");
      setShowPermissionModal(false);

      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(async () => {
        if (peerConnectionRef.current) {
          devLog("Call unanswered for 45 seconds — setting status to missed...");
          await setDoc(
            callDocRef,
            { status: "missed", endedAt: serverTimestamp() },
            { merge: true }
          );
        }
      }, 45000);
    } catch (err: any) {
      callError("Error initiating call:", err);
      setPermissionError("Camera/mic access is needed for calls — please enable it in browser settings.");
    }
  };

  // Caller Ringing Audio Effect (Dial Tone or Partner's Caller Tune)
  const isCallerRinging = callData?.status === "ringing" && callData?.callerId === myUid;

  useEffect(() => {
    let loopInterval: NodeJS.Timeout | null = null;

    if (isCallerRinging) {
      if (callerTuneTrack?.videoId) {
        loadYouTubeIframeApi()
          .then((YT) => {
            if (!isCallerRinging) return;

            if (callerTuneYtPlayerRef.current) {
              try {
                callerTuneYtPlayerRef.current.loadVideoById({
                  videoId: callerTuneTrack.videoId,
                  startSeconds: callerTuneTrack.clipStartSec || 0,
                });
              } catch (e) {}
            } else if (YT && YT.Player) {
              callerTuneYtPlayerRef.current = new YT.Player("call-caller-tune-yt-player-container", {
                height: "0",
                width: "0",
                videoId: callerTuneTrack.videoId,
                playerVars: {
                  autoplay: 1,
                  controls: 0,
                  start: callerTuneTrack.clipStartSec || 0,
                },
                events: {
                  onReady: (event: any) => {
                    try {
                      event.target.playVideo();
                    } catch (e) {}
                  },
                  onStateChange: (event: any) => {
                    if (event.data === window.YT.PlayerState.ENDED) {
                      try {
                        event.target.seekTo(callerTuneTrack.clipStartSec || 0, true);
                        event.target.playVideo();
                      } catch (e) {}
                    }
                  },
                },
              });
            }

            loopInterval = setInterval(() => {
              if (
                callerTuneYtPlayerRef.current &&
                typeof callerTuneYtPlayerRef.current.getCurrentTime === "function"
              ) {
                try {
                  const currTime = callerTuneYtPlayerRef.current.getCurrentTime();
                  const start = callerTuneTrack.clipStartSec || 0;
                  const duration = callerTuneTrack.clipDurationSec || 20;
                  if (currTime >= start + duration) {
                    callerTuneYtPlayerRef.current.seekTo(start, true);
                  }
                } catch (e) {}
              }
            }, 500);
          })
          .catch((err) => {
            callError("Failed to load YouTube IFrame API for caller tune:", err);
            toneManager.startDialTone();
          });
      } else {
        toneManager.startDialTone();
      }
    } else {
      toneManager.stopAllTones();
      if (callerTuneYtPlayerRef.current) {
        try {
          callerTuneYtPlayerRef.current.stopVideo();
        } catch (e) {}
      }
    }

    return () => {
      if (loopInterval) clearInterval(loopInterval);
      toneManager.stopAllTones();
      if (callerTuneYtPlayerRef.current) {
        try {
          callerTuneYtPlayerRef.current.stopVideo();
        } catch (e) {}
      }
    };
  }, [isCallerRinging, callerTuneTrack]);

  // Perfect Negotiation: Handle Incoming Offers & Answers during active call
  useEffect(() => {
    if (!peerConnectionRef.current || callData?.status !== "active") return;
    const pc = peerConnectionRef.current;

    const handleSignaling = async () => {
      // 1. Handle Remote Answer (initial answer or renegotiated answer)
      if (callData.answer && callData.answer.sdp !== lastAppliedAnswerRef.current) {
        if (pc.signalingState === "have-local-offer") {
          lastAppliedAnswerRef.current = callData.answer.sdp;
          isSettingRemoteAnswerPendingRef.current = true;
          try {
            const remoteAnswer = new RTCSessionDescription({
              type: callData.answer.type,
              sdp: callData.answer.sdp,
            });
            await pc.setRemoteDescription(remoteAnswer);
            await flushIceCandidateQueue(pc);
            isInitialHandshakePendingRef.current = false;
            ignoreOfferRef.current = false;
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            setStatusMessage(null);
            devLog("Remote SDP answer applied successfully.");
          } catch (e: any) {
            setFirstErrorName((prev) => prev || e?.name || "SetRemoteAnswerError");
            callError("Error setting remote answer:", e);
          } finally {
            isSettingRemoteAnswerPendingRef.current = false;
          }
        }
      }

      // 2. Handle Remote Offer (renegotiation offer from partner)
      if (callData.offer && callData.offer.sdp !== lastAppliedOfferRef.current) {
        const isPartnerOffer =
          callData.renegotiationBy === partnerUid ||
          Boolean(callData.renegotiationAt) ||
          (callData.callerId && callData.callerId !== myUid);

        if (isPartnerOffer) {
          const offerDesc = new RTCSessionDescription({
            type: callData.offer.type,
            sdp: callData.offer.sdp,
          });

          const readyForOffer =
            !makingOfferRef.current &&
            (pc.signalingState === "stable" || isSettingRemoteAnswerPendingRef.current);
          const offerCollision = !readyForOffer;

          ignoreOfferRef.current = !polite && offerCollision;
          if (ignoreOfferRef.current) {
            callWarn("Offer collision: impolite peer is ignoring partner colliding offer");
            return;
          }

          lastAppliedOfferRef.current = callData.offer.sdp;
          try {
            // Polite peer automatically rolls back local offer if in have-local-offer
            await pc.setRemoteDescription(offerDesc);
            await flushIceCandidateQueue(pc);

            const rawAnswer = await pc.createAnswer();
            const boostedSdp = optimizeOpusSdp(rawAnswer.sdp);
            const answer = new RTCSessionDescription({ type: rawAnswer.type, sdp: boostedSdp || rawAnswer.sdp });
            await pc.setLocalDescription(answer);

            if (coupleId) {
              const callDocRef = doc(db, "couples", coupleId, "call", "current");
              await setDoc(
                callDocRef,
                {
                  answer: {
                    type: answer.type,
                    sdp: answer.sdp,
                  },
                  renegotiationAnswerAt: Date.now(),
                },
                { merge: true }
              );
              devLog("Renegotiation answer created, set, and posted to Firestore.");
            }
          } catch (err: any) {
            setFirstErrorName((prev) => prev || err?.name || "HandleOfferError");
            callError("Error handling renegotiation offer:", err);
          } finally {
            ignoreOfferRef.current = false;
          }
        }
      }
    };

    handleSignaling();
  }, [callData, coupleId, myUid, partnerUid, polite]);

  // 15. CALLEE FLOW: Execute Accept Call
  const executeAcceptCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !callData?.offer) return;

    try {
      setCallType(typeToUse);
      setPermissionError(null);
      isInitialHandshakePendingRef.current = true;

      if (preCallStreamRef.current) {
        preCallStreamRef.current.getTracks().forEach((t) => t.stop());
        preCallStreamRef.current = null;
      }
      setPreCallPreviewActive(false);

      const stream = await acquireLocalMediaStream(typeToUse);
      localStreamRef.current = stream;
      setLocalStream(stream);

      refreshMediaDevices();

      const pc = await createPeerConnection(typeToUse);
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === "video" && adaptiveControllerRef.current) {
          adaptiveControllerRef.current.setVideoSender(sender);
          adaptiveControllerRef.current.setLocalVideoTrack(track, isCameraOff);
        }
      });
      preferVp8VideoCodec(pc);

      listenToRemoteIceCandidates(pc);

      const remoteOffer = new RTCSessionDescription({
        type: callData.offer.type,
        sdp: callData.offer.sdp,
      });

      lastAppliedOfferRef.current = callData.offer.sdp;
      await pc.setRemoteDescription(remoteOffer);
      await flushIceCandidateQueue(pc);

      const rawAnswer = await pc.createAnswer();
      const boostedSdp = optimizeOpusSdp(rawAnswer.sdp);
      const answer = new RTCSessionDescription({ type: rawAnswer.type, sdp: boostedSdp || rawAnswer.sdp });
      await pc.setLocalDescription(answer);
      lastAppliedAnswerRef.current = answer.sdp;

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

      isInitialHandshakePendingRef.current = false;
      setStatusMessage(null);
      setShowPermissionModal(false);
    } catch (err: any) {
      setFirstErrorName((prev) => prev || err?.name || "AcceptCallError");
      callError("Error accepting call / getUserMedia failed:", err);
      setPermissionError("Camera/mic access is needed for calls — please enable it in browser settings.");

      if (coupleId) {
        const callDocRef = doc(db, "couples", coupleId, "call", "current");
        setDoc(callDocRef, { status: "ended", endedAt: serverTimestamp() }, { merge: true }).catch(
          (e) => callError("Error setting ended state:", e)
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

  // 16. Hang Up Action & State Hygiene
  const handleHangUp = async () => {
    if (!coupleId) return;

    try {
      cleanUpLocalMediaAndPeer();

      const callDocRef = doc(db, "couples", coupleId, "call", "current");
      await setDoc(callDocRef, { status: "ended", endedAt: serverTimestamp() }, { merge: true });

      deleteIceCandidatesSubcollection();

      setTimeout(async () => {
        try {
          await setDoc(callDocRef, { status: "idle" });
        } catch (e) {}
      }, 1500);
    } catch (err) {
      callError("Error hanging up call:", err);
    }
  };

  // Toggle Mute Audio (via track.enabled for instantaneous mute without stopping hardware)
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  // Toggle Camera Video (via track.enabled)
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const nextOff = !isCameraOff;
        videoTrack.enabled = !nextOff;
        setIsCameraOff(nextOff);
        if (adaptiveControllerRef.current) {
          adaptiveControllerRef.current.setUserCameraOff(nextOff);
        }
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
  const activeCallType = callData?.type || callType;

  // Mirror calculation: Only mirror when facingMode is front ("user")
  const isSelfMirrored = facingMode === "user";
  const localMirrorClass = isSelfMirrored ? "-scale-x-100" : "";

  // Selected output device label for badge display
  const activeOutputDeviceLabel =
    audioOutputDevices.find((d) => d.deviceId === selectedAudioOutput)?.label || "Audio Output";

  const isBluetoothActive =
    activeOutputDeviceLabel.toLowerCase().includes("bluetooth") ||
    activeOutputDeviceLabel.toLowerCase().includes("headphone") ||
    activeOutputDeviceLabel.toLowerCase().includes("headset") ||
    activeOutputDeviceLabel.toLowerCase().includes("earphone");

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] relative overflow-hidden rounded-3xl border border-rose-500/40 bg-[#16060E]/95 shadow-2xl">
      {/* Dedicated Single Audio element for remote sound playback with no echo */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Audio playback unlock prompt (displayed when browser autoplay policy blocks audio/video play) */}
      {showAudioUnlockButton && isInCall && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={handleUnlockAudio}
            className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-2xl flex items-center gap-2 border border-white/30 animate-bounce"
          >
            <Volume2 className="w-4 h-4 text-white" />
            <span>Tap to enable sound</span>
          </button>
        </div>
      )}

      {/* Permission Pre-Prompt Modal */}
      <MediaPermissionModal
        isOpen={showPermissionModal}
        callType={callType}
        partnerName={partnerName}
        onConfirm={() => initiateCall(callType)}
        onCancel={() => setShowPermissionModal(false)}
        permissionError={permissionError}
      />

      {/* Audio / Video Device Settings Popover Modal */}
      {showDeviceSettings && (
        <div className="fixed inset-0 bg-[#12040A]/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E0613] border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-white relative">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
              <div className="flex items-center space-x-2">
                <Headphones className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-extrabold text-white">Audio & Video Devices</h3>
              </div>
              <button
                onClick={() => setShowDeviceSettings(false)}
                className="p-1.5 rounded-full hover:bg-rose-500/20 text-rose-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Audio Output (Speakers / Bluetooth Headphones) */}
              <div className="space-y-1.5">
                <label className="font-bold text-rose-200 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>Audio Output (Headphones / Speakers):</span>
                </label>
                <select
                  value={selectedAudioOutput}
                  onChange={(e) => applyAudioOutputDevice(e.target.value)}
                  className="w-full bg-[#2B0A1A] border border-rose-500/30 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-400"
                >
                  {audioOutputDevices.length > 0 ? (
                    audioOutputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker / Headset (${d.deviceId.slice(0, 5)})`}
                      </option>
                    ))
                  ) : (
                    <option value="">Default System Output</option>
                  )}
                </select>
              </div>

              {/* Audio Input (Microphones / Bluetooth Mic) */}
              <div className="space-y-1.5">
                <label className="font-bold text-rose-200 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-rose-400" />
                  <span>Microphone (Audio Input):</span>
                </label>
                <select
                  value={selectedAudioInput}
                  onChange={(e) => changeAudioInputDevice(e.target.value)}
                  className="w-full bg-[#2B0A1A] border border-rose-500/30 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-400"
                >
                  {audioInputDevices.length > 0 ? (
                    audioInputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone (${d.deviceId.slice(0, 5)})`}
                      </option>
                    ))
                  ) : (
                    <option value="">Default Microphone</option>
                  )}
                </select>
              </div>

              {/* Video Input (Cameras / Webcams) */}
              {activeCallType === "video" && (
                <div className="space-y-1.5">
                  <label className="font-bold text-rose-200 flex items-center gap-2">
                    <Video className="w-4 h-4 text-rose-400" />
                    <span>Camera (HD Video Input):</span>
                  </label>
                  <select
                    value={selectedVideoInput}
                    onChange={(e) => changeVideoInputDevice(e.target.value)}
                    className="w-full bg-[#2B0A1A] border border-rose-500/30 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-400"
                  >
                    {videoInputDevices.length > 0 ? (
                      videoInputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera (${d.deviceId.slice(0, 5)})`}
                        </option>
                      ))
                    ) : (
                      <option value="">Default HD Camera</option>
                    )}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowDeviceSettings(false)}
              className="moi-button-primary w-full py-3 text-xs font-bold flex items-center justify-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Done</span>
            </button>
          </div>
        </div>
      )}

      {/* Diagnostics / Stats Debug Overlay — strictly only rendered when NEXT_PUBLIC_CALL_DEBUG=1 or in dev */}
      {CALL_DEBUG_ENABLED && showDebugOverlay && (
        <CallDebugOverlay
          stats={callStats}
          reconnectStatus={reconnectBanner}
          signalingState={signalingState}
          iceConnectionState={iceConnectionState}
          connectionState={peerConnectionState}
          localTrackCount={localStream?.getTracks().length || 0}
          remoteTrackCount={remoteStream?.getTracks().length || 0}
          ontrackFired={ontrackFired}
          turnStatus={getLastTurnHttpStatus() !== null ? String(getLastTurnHttpStatus()) : "unfetched"}
          remoteVideoHasSrc={Boolean(remoteVideoRef.current?.srcObject)}
          remoteVideoPlaying={Boolean(remoteVideoRef.current && !remoteVideoRef.current.paused)}
          remoteAudioHasSrc={Boolean(remoteAudioRef.current?.srcObject)}
          remoteAudioPlaying={Boolean(remoteAudioRef.current && !remoteAudioRef.current.paused)}
          firstErrorName={firstErrorName}
          onClose={() => setShowDebugOverlay(false)}
        />
      )}

      {!isInCall ? (
        /* IDLE / PRE-CALL LAUNCHER VIEW */
        <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
          {preCallPreviewActive ? (
            <div className="relative w-48 h-64 sm:w-56 sm:h-72 rounded-3xl overflow-hidden border-2 border-rose-500/60 shadow-2xl bg-black animate-fade-in">
              <video
                ref={preCallVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isSelfMirrored ? "-scale-x-100" : ""}`}
              />
              {/* Controls on pre-call preview */}
              <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                <button
                  onClick={flipCamera}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors"
                  title={`Switch camera (currently: ${facingMode === "user" ? "Front" : "Rear"})`}
                >
                  <SwitchCamera className="w-4 h-4 text-rose-300" />
                </button>
                <button
                  onClick={togglePreCallPreview}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors"
                  title="Close camera preview"
                >
                  <X className="w-4 h-4 text-rose-300" />
                </button>
              </div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-[10px] text-white font-bold whitespace-nowrap">
                <span>{facingMode === "user" ? "Front Camera (Mirrored)" : "Rear Camera (Normal)"}</span>
              </div>
            </div>
          ) : (
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
          )}

          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-white flex items-center justify-center gap-2">
              <span>Call {partnerName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>HD WebRTC</span>
              </span>
            </h2>
            <p className="text-xs text-rose-300/70">
              {partnerOnline ? "Partner is online and ready for call" : "Partner is currently offline"}
            </p>
            {!preCallPreviewActive && (
              <button
                onClick={togglePreCallPreview}
                className="pt-2 text-xs text-rose-300/80 hover:text-rose-200 underline font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Video className="w-3.5 h-3.5 text-rose-400" />
                <span>Test Camera Preview</span>
              </button>
            )}
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
              <span>Start HD Video Call</span>
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
      ) : activeCallType === "video" ? (
        /* ACTIVE DUAL HIGH-RESOLUTION VIDEO CALL UI */
        <div className="relative w-full h-full bg-[#0D0308] flex items-center justify-center overflow-hidden">
          {/* Main Full-Screen Video (Remote Partner or Swapped Local) */}
          <video
            ref={isSwappedView ? localVideoRef : remoteVideoRef}
            autoPlay
            playsInline
            muted={true}
            className={`w-full h-full object-cover ${isSwappedView ? localMirrorClass : ""}`}
          />

          {/* Connecting Spinner Overlay */}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16060E]/90 z-10 space-y-3">
              <Loader2 className="w-10 h-10 text-rose-400 animate-spin" />
              <span className="text-sm font-bold text-rose-200">Connecting HD video stream with {partnerName}...</span>
            </div>
          )}

          {/* Reconnecting Banner */}
          {reconnectBanner && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-amber-500/90 text-black font-bold text-xs shadow-lg flex items-center gap-2 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{reconnectBanner}</span>
            </div>
          )}

          {/* Weak connection: audio only banner */}
          {callStats?.isVideoPausedForWeakConnection && !reconnectBanner && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-amber-600/95 text-white font-bold text-xs shadow-lg flex items-center gap-2 animate-pulse border border-white/20">
              <AlertCircle className="w-4 h-4 text-amber-200" />
              <span>Weak connection: audio only</span>
            </div>
          )}

          {/* Floating PIP Corner Preview Video (Tap to Swap View) */}
          <div
            onClick={() => setIsSwappedView(!isSwappedView)}
            className="absolute top-4 right-4 w-32 h-44 sm:w-44 sm:h-60 rounded-2xl border-2 border-rose-500/60 bg-[#16060E] overflow-hidden shadow-2xl z-20 cursor-pointer group hover:scale-105 transition-transform"
            title="Click to swap fullscreen video view"
          >
            <video
              ref={isSwappedView ? remoteVideoRef : localVideoRef}
              autoPlay
              playsInline
              muted={true}
              className={`w-full h-full object-cover pointer-events-none ${!isSwappedView ? localMirrorClass : ""}`}
            />
            <div className="absolute bottom-1 right-1 p-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-[10px] font-bold opacity-80 group-hover:opacity-100 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-rose-300" />
              <span>Swap</span>
            </div>
          </div>

          {/* Top Status, Timer, Quality Badge & Device Overlay */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2.5 px-3.5 py-1.5 rounded-2xl bg-[#16060E]/85 backdrop-blur-md border border-rose-500/30">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-white">{partnerName}</span>
              <span className="text-xs font-mono text-rose-300/80 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                <span>{formatTimer(callSeconds)}</span>
              </span>
            </div>

            {/* Quality Indicator Badge (Good / Fair / Poor) */}
            {callStats && (
              <button
                onClick={() => {
                  if (CALL_DEBUG_ENABLED) {
                    setShowDebugOverlay(!showDebugOverlay);
                  }
                }}
                disabled={!CALL_DEBUG_ENABLED}
                className={`text-[11px] px-2.5 py-1 rounded-full font-bold border backdrop-blur-md flex items-center gap-1.5 transition-colors ${
                  callStats.quality === "good"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : callStats.quality === "fair"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                }`}
                title={CALL_DEBUG_ENABLED ? "Click to toggle diagnostics overlay" : "Connection quality"}
              >
                <Activity className="w-3 h-3" />
                <span className="capitalize">{callStats.quality}</span>
              </button>
            )}

            {isBluetoothActive && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 flex items-center gap-1 backdrop-blur-md">
                <Headphones className="w-3 h-3 text-emerald-400" />
                <span>Bluetooth Headset</span>
              </span>
            )}
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2.5 sm:px-5 sm:py-3 rounded-3xl bg-[#16060E]/90 backdrop-blur-xl border border-rose-500/40 flex items-center space-x-3 sm:space-x-4 shadow-2xl">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-2xl transition-all ${
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
              className={`p-3 rounded-2xl transition-all ${
                isCameraOff
                  ? "bg-rose-600 text-white"
                  : "bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30"
              }`}
              title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {/* Flip Camera (Front / Rear) */}
            <button
              onClick={flipCamera}
              className="p-3 rounded-2xl bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30 transition-all"
              title={`Switch Camera (Currently: ${facingMode === "user" ? "Front" : "Rear"})`}
            >
              <SwitchCamera className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowDeviceSettings(true)}
              className="p-3 rounded-2xl bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30 transition-all relative"
              title="Audio Output & Microphone Devices (Bluetooth / Speakers)"
            >
              <Headphones className="w-5 h-5" />
              {isBluetoothActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
              )}
            </button>

            <button
              onClick={handleHangUp}
              className="p-3.5 rounded-2xl bg-rose-700 hover:bg-rose-800 text-white shadow-lg transition-transform active:scale-95"
              title="Hang Up Call"
            >
              <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
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
                <span>In HD Call • {formatTimer(callSeconds)}</span>
              </p>
              {callStats && (
                <button
                  onClick={() => {
                    if (CALL_DEBUG_ENABLED) {
                      setShowDebugOverlay(!showDebugOverlay);
                    }
                  }}
                  disabled={!CALL_DEBUG_ENABLED}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border mt-2 ${
                    callStats.quality === "good"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : callStats.quality === "fair"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  }`}
                  title={CALL_DEBUG_ENABLED ? "Click to toggle diagnostics overlay" : "Connection quality"}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span className="capitalize">{callStats.quality} Quality</span>
                </button>
              )}
              {isBluetoothActive && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 mt-2 ml-2">
                  <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Bluetooth Audio Active</span>
                </span>
              )}
              {callStats?.isVideoPausedForWeakConnection && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Weak connection: audio only</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Audio Control Bar */}
          <div className="pb-8 flex items-center space-x-4 sm:space-x-5">
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
              onClick={() => setShowDeviceSettings(true)}
              className="p-4 rounded-2xl bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30 transition-all relative"
              title="Audio Output & Microphone Devices (Bluetooth / Speakers)"
            >
              <Headphones className="w-6 h-6" />
              {isBluetoothActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
              )}
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

      {/* Hidden Off-Screen Dedicated Call Caller-Tune YouTube Container */}
      <div id="call-caller-tune-yt-player-container" className="hidden w-0 h-0 overflow-hidden" />
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
