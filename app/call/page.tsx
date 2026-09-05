"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import MediaPermissionModal from "@/components/MediaPermissionModal";
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
} from "lucide-react";

// Google's Free Public STUN Servers Config
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

// Helper: SDP Opus Audio Optimization (128 kbps bitrate + FEC for high-clarity sound)
const optimizeAudioSdp = (sdp?: string): string | undefined => {
  if (!sdp) return sdp;
  return sdp.replace(/a=fmtp:111 (.*)/g, (match, p1) => {
    if (p1.includes("maxaveragebitrate")) return match;
    return `a=fmtp:111 ${p1};maxaveragebitrate=128000;stereo=0;useinbandfec=1;usedtx=0`;
  });
};

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
  const [isSwappedView, setIsSwappedView] = useState<boolean>(false);

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
  const callerTuneYtPlayerRef = useRef<any>(null);

  const [callerTuneTrack, setCallerTuneTrack] = useState<{ videoId: string; clipStartSec: number } | null>(null);

  const coupleId = couple?.id;
  const myUid = user?.uid;
  const partnerUid = couple?.userIds?.find((id) => id !== myUid);

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
      console.error("Error enumerating media devices:", err);
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
        if (remoteVideoRef.current && "setSinkId" in remoteVideoRef.current) {
          await (remoteVideoRef.current as any).setSinkId(deviceId);
        }
        if (remoteAudioRef.current && "setSinkId" in remoteAudioRef.current) {
          await (remoteAudioRef.current as any).setSinkId(deviceId);
        }
      } catch (err) {
        console.error("Error setting audio output sink ID:", err);
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
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      const oldTrack = localStreamRef.current.getAudioTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      console.error("Error switching microphone device:", err);
    }
  };

  // 4. Change Video Input Camera Live Mid-Call
  const changeVideoInputDevice = async (deviceId: string) => {
    setSelectedVideoInput(deviceId);
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      console.error("Error switching camera device:", err);
    }
  };

  // 5. Subscribe to Firestore Call Signaling Document
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

  // 6. Bind Local Stream to Local Video Ref
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch((err) => console.log("Local video play notice:", err));
    }
  }, [localStream, callData?.status, callData?.type, callType, isSwappedView]);

  // 7. Bind Remote Stream to Remote Video and Remote Audio Refs
  useEffect(() => {
    if (!remoteStream) return;

    const activeType = callData?.type || callType;

    if (activeType === "video" && remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch((err) => console.log("Remote video play notice:", err));
    }

    if (remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.play().catch((err) => console.log("Remote audio play notice:", err));
    }

    if (selectedAudioOutput) {
      applyAudioOutputDevice(selectedAudioOutput);
    }
  }, [remoteStream, callData?.status, callData?.type, callType, isSwappedView, selectedAudioOutput, applyAudioOutputDevice]);

  // 8. Format Active Call Duration Timer (MM:SS)
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

  // 9. Clean up ICE Candidate collection documents
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

  // 10. Local WebRTC & Stream Cleanup
  const cleanUpLocalMediaAndPeer = useCallback(() => {
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
  }, []);

  // Ensure cleanup on component unmount
  useEffect(() => {
    return () => cleanUpLocalMediaAndPeer();
  }, [cleanUpLocalMediaAndPeer]);

  // 11. Initialize Local RTCPeerConnection with STUN Servers
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

    // Handle Remote Stream Tracks — Clone new MediaStream object so React state reference updates!
    pc.ontrack = (event) => {
      console.log("Remote track received:", event.track.kind, event.streams);

      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      if (!remoteStreamRef.current.getTracks().some((t) => t.id === event.track.id)) {
        remoteStreamRef.current.addTrack(event.track);
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          if (!remoteStreamRef.current!.getTracks().some((tr) => tr.id === t.id)) {
            remoteStreamRef.current!.addTrack(t);
          }
        });
      }

      // Create a NEW MediaStream instance with all tracks so React detects state reference change!
      const updatedStream = new MediaStream(remoteStreamRef.current.getTracks());
      setRemoteStream(updatedStream);
    };

    return pc;
  };

  // 12. Listen to incoming ICE Candidates with Queuing / Buffering
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

  // Acquire Media Stream helper with 1080p HD Video resolution preference
  const acquireLocalMediaStream = async (typeToUse: "audio" | "video"): Promise<MediaStream> => {
    const audioConstraint = selectedAudioInput
      ? { deviceId: { exact: selectedAudioInput }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } };

    if (typeToUse === "audio") {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
    }

    // High Definition 1080p Video Constraint with fallback to 720p
    const videoConstraint1080p = selectedVideoInput
      ? { deviceId: { exact: selectedVideoInput }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
      : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: "user" };

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: videoConstraint1080p });
    } catch (err1080) {
      console.log("1080p resolution fallback to 720p standard HD...");
      const videoConstraint720p = selectedVideoInput
        ? { deviceId: { exact: selectedVideoInput }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: videoConstraint720p });
    }
  };

  // 13. CALLER FLOW: Initiate Call
  const initiateCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !partnerUid) return;

    try {
      // 1. Immediately unlock caller AudioContext on user interaction click
      await toneManager.unlockAudioContext();
      setCallType(typeToUse);

      if (callData?.status === "ringing" && callData.callerId === partnerUid) {
        console.log("Glare detected: partner is already calling — switching to answer partner's call...");
        await executeAcceptCall(typeToUse);
        return;
      }

      setPermissionError(null);

      // 2. Fetch partner's custom caller tune preference (if set)
      try {
        const partnerUserDocRef = doc(db, "users", partnerUid);
        const partnerSnap = await getDoc(partnerUserDocRef);
        if (partnerSnap.exists() && partnerSnap.data()?.callerTune?.videoId) {
          const tune = partnerSnap.data().callerTune;
          setCallerTuneTrack({ videoId: tune.videoId, clipStartSec: tune.clipStartSec || 0 });
        } else {
          setCallerTuneTrack(null);
        }
      } catch (e) {
        console.warn("Could not fetch partner caller tune:", e);
        setCallerTuneTrack(null);
      }

      const stream = await acquireLocalMediaStream(typeToUse);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Enumerate devices once permission granted
      refreshMediaDevices();

      const pc = createPeerConnection(typeToUse);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      listenToRemoteIceCandidates(pc);

      const rawOffer = await pc.createOffer();
      const boostedSdp = optimizeAudioSdp(rawOffer.sdp);
      const offer = new RTCSessionDescription({ type: rawOffer.type, sdp: boostedSdp });
      await pc.setLocalDescription(offer);

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

  // Caller Ringing Audio Effect (Dial Tone or Partner's Caller Tune)
  const isCallerRinging = callData?.status === "ringing" && callData?.callerId === myUid;

  useEffect(() => {
    if (isCallerRinging) {
      if (callerTuneTrack?.videoId) {
        const initYtPlayer = () => {
          if (typeof window === "undefined") return;

          const loadOrInit = () => {
            if (callerTuneYtPlayerRef.current) {
              try {
                callerTuneYtPlayerRef.current.loadVideoById({
                  videoId: callerTuneTrack.videoId,
                  startSeconds: callerTuneTrack.clipStartSec || 0,
                });
              } catch (e) {}
              return;
            }

            if (window.YT && window.YT.Player) {
              callerTuneYtPlayerRef.current = new window.YT.Player("call-caller-tune-yt-player-container", {
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
                    // Loop caller tune clip back to start if it ends while ringing
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
          };

          if (window.YT && window.YT.Player) {
            loadOrInit();
          } else {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName("script")[0];
            firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
            window.onYouTubeIframeAPIReady = loadOrInit;
          }
        };

        initYtPlayer();
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
      toneManager.stopAllTones();
      if (callerTuneYtPlayerRef.current) {
        try {
          callerTuneYtPlayerRef.current.stopVideo();
        } catch (e) {}
      }
    };
  }, [isCallerRinging, callerTuneTrack]);

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

  // 14. CALLEE FLOW: Execute Accept Call
  const executeAcceptCall = async (typeToUse: "audio" | "video") => {
    if (!coupleId || !myUid || !callData?.offer) return;

    try {
      setCallType(typeToUse);
      setPermissionError(null);

      const stream = await acquireLocalMediaStream(typeToUse);
      localStreamRef.current = stream;
      setLocalStream(stream);

      refreshMediaDevices();

      const pc = createPeerConnection(typeToUse);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      listenToRemoteIceCandidates(pc);

      const remoteOffer = new RTCSessionDescription({
        type: callData.offer.type,
        sdp: callData.offer.sdp,
      });

      await pc.setRemoteDescription(remoteOffer);

      await flushIceCandidateQueue(pc);

      const rawAnswer = await pc.createAnswer();
      const boostedSdp = optimizeAudioSdp(rawAnswer.sdp);
      const answer = new RTCSessionDescription({ type: rawAnswer.type, sdp: boostedSdp });
      await pc.setLocalDescription(answer);

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

  // 15. Hang Up Action & State Hygiene
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
  const activeCallType = callData?.type || callType;

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
      {/* Dedicated Audio element for audio output routing */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

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
                <span>1080p HD WebRTC</span>
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
            muted={isSwappedView}
            className="w-full h-full object-cover"
          />

          {/* Hidden reference video tag to maintain stream binding when swapped */}
          <div className="hidden">
            <video ref={isSwappedView ? remoteVideoRef : localVideoRef} autoPlay playsInline muted={!isSwappedView} />
          </div>

          {/* Connecting Spinner Overlay */}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16060E]/90 z-10 space-y-3">
              <Loader2 className="w-10 h-10 text-rose-400 animate-spin" />
              <span className="text-sm font-bold text-rose-200">Connecting HD video stream with {partnerName}...</span>
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
              muted={!isSwappedView}
              className="w-full h-full object-cover pointer-events-none"
            />
            <div className="absolute bottom-1 right-1 p-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-[10px] font-bold opacity-80 group-hover:opacity-100 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-rose-300" />
              <span>Swap</span>
            </div>
          </div>

          {/* Top Status, Timer & Device Badge Overlay */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2.5 px-3.5 py-1.5 rounded-2xl bg-[#16060E]/85 backdrop-blur-md border border-rose-500/30">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-white">{partnerName}</span>
              <span className="text-xs font-mono text-rose-300/80 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                <span>{formatTimer(callSeconds)}</span>
              </span>
            </div>

            {isBluetoothActive && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 flex items-center gap-1 backdrop-blur-md">
                <Headphones className="w-3 h-3 text-emerald-400" />
                <span>Bluetooth Headset</span>
              </span>
            )}
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-5 py-3 rounded-3xl bg-[#16060E]/90 backdrop-blur-xl border border-rose-500/40 flex items-center space-x-4 sm:space-x-5 shadow-2xl">
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
              onClick={() => setShowDeviceSettings(true)}
              className="p-3.5 rounded-2xl bg-wine-900/60 text-rose-300 hover:text-white border border-rose-500/30 transition-all relative"
              title="Audio Output & Microphone Devices (Bluetooth / Speakers)"
            >
              <Headphones className="w-5 h-5" />
              {isBluetoothActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
              )}
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
                <span>In HD Call • {formatTimer(callSeconds)}</span>
              </p>
              {isBluetoothActive && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 mt-2">
                  <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Bluetooth Audio Active</span>
                </span>
              )}
            </div>
          </div>

          {/* Bottom Audio Control Bar */}
          <div className="pb-8 flex items-center space-x-5 sm:space-x-6">
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
