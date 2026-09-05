"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

export interface Track {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

export interface CurrentTrack extends Track {
  isPlaying: boolean;
  positionAtUpdate: number;
  updatedAt?: any;
  updatedBy?: string;
}

export interface QueueItem extends Track {
  id: string;
  order: number;
  addedBy: string;
  createdAt?: any;
}

interface MusicContextType {
  currentTrack: CurrentTrack | null;
  queue: QueueItem[];
  isPlaying: boolean;
  localVolume: number;
  isPlayerReady: boolean;
  pendingAutoplayJoin: boolean;
  measuredDriftSec: number;
  searchWarning: string | null;
  currentTime: number;
  duration: number;
  playTrack: (track: Track) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (itemId: string) => Promise<void>;
  reorderQueueItem: (itemId: string, newOrder: number) => Promise<void>;
  skipNextTrack: () => Promise<void>;
  setLocalVolume: (volume: number) => void;
  joinSyncPlayback: () => void;
  searchTracks: (query: string) => Promise<Track[]>;
}

const MusicContext = createContext<MusicContextType>({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  localVolume: 80,
  isPlayerReady: false,
  pendingAutoplayJoin: false,
  measuredDriftSec: 0,
  searchWarning: null,
  currentTime: 0,
  duration: 0,
  playTrack: async () => {},
  togglePlayPause: async () => {},
  seekTo: async () => {},
  addToQueue: async () => {},
  removeFromQueue: async () => {},
  reorderQueueItem: async () => {},
  skipNextTrack: async () => {},
  setLocalVolume: () => {},
  joinSyncPlayback: () => {},
  searchTracks: async () => [],
});

export const useMusic = () => useContext(MusicContext);

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const { user, couple } = useAuth();
  const coupleId = couple?.id;

  const [currentTrack, setCurrentTrack] = useState<CurrentTrack | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localVolume, setLocalVolumeState] = useState<number>(80);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);
  const [pendingAutoplayJoin, setPendingAutoplayJoin] = useState<boolean>(false);
  const [measuredDriftSec, setMeasuredDriftSec] = useState<number>(0.24);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const playerRef = useRef<any>(null);
  const currentTrackRef = useRef<CurrentTrack | null>(null);
  currentTrackRef.current = currentTrack;

  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const isUserActionRef = useRef<boolean>(false);

  // 1. Initial Local Volume setup
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedVol = localStorage.getItem("moi_music_volume");
      if (savedVol) setLocalVolumeState(parseInt(savedVol, 10));
    }
  }, []);

  // 2. Load YouTube IFrame Player API Script
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initYT = () => {
      if (window.YT && window.YT.Player) {
        createGlobalPlayer();
      } else {
        window.onYouTubeIframeAPIReady = () => {
          createGlobalPlayer();
        };

        if (!document.getElementById("yt-iframe-api-script")) {
          const tag = document.createElement("script");
          tag.id = "yt-iframe-api-script";
          tag.src = "https://www.youtube.com/iframe_api";
          const firstScriptTag = document.getElementsByTagName("script")[0];
          firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }
      }
    };

    const createGlobalPlayer = () => {
      if (playerRef.current) return;

      playerRef.current = new window.YT.Player("global-yt-player-container", {
        height: "1",
        width: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (evt: any) => {
            setIsPlayerReady(true);
            const savedVol = localStorage.getItem("moi_music_volume");
            const vol = savedVol ? parseInt(savedVol, 10) : 80;
            if (evt.target.unMute) evt.target.unMute();
            if (evt.target.setVolume) evt.target.setVolume(vol);

            if (currentTrackRef.current) {
              syncLocalPlayerWithState(currentTrackRef.current, null);
            }
          },
          onStateChange: (evt: any) => {
            // Track Ended (0) -> Execute Atomic Firestore Transaction to advance queue
            if (evt.data === 0) {
              handleTrackEnd();
            } else if (evt.data === 1) {
              setPendingAutoplayJoin(false);
            } else if ((evt.data === 2 || evt.data === -1) && currentTrackRef.current?.isPlaying) {
              setTimeout(() => {
                if (playerRef.current && playerRef.current.getPlayerState) {
                  const st = playerRef.current.getPlayerState();
                  if (st !== 1 && st !== 3 && currentTrackRef.current?.isPlaying) {
                    setPendingAutoplayJoin(true);
                  }
                }
              }, 500);
            }
          },
        },
      });
    };

    initYT();
  }, []);

  // Synchronize playback whenever player becomes ready or track changes
  useEffect(() => {
    if (isPlayerReady && currentTrack) {
      syncLocalPlayerWithState(currentTrack, null);
    }
  }, [isPlayerReady, currentTrack?.videoId, currentTrack?.isPlaying]);

  // 3. Subscribe to couples/{coupleId}/music/current
  useEffect(() => {
    if (!coupleId) return;

    const currentDocRef = doc(db, "couples", coupleId, "music", "current");
    const unsubscribe = onSnapshot(currentDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CurrentTrack;
        const prevData = currentTrackRef.current;
        setCurrentTrack(data);

        // Synchronize local YouTube Player with incoming Firestore state
        syncLocalPlayerWithState(data, prevData);
      } else {
        setCurrentTrack(null);
        if (playerRef.current && playerRef.current.pauseVideo) {
          playerRef.current.pauseVideo();
        }
      }
    });

    return () => unsubscribe();
  }, [coupleId]);

  // 4. Subscribe to couples/{coupleId}/musicQueue
  useEffect(() => {
    if (!coupleId) return;

    const queueCollRef = collection(db, "couples", coupleId, "musicQueue");
    const q = query(queueCollRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const items: QueueItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QueueItem, "id">),
      }));
      setQueue(items);
    });

    return () => unsubscribe();
  }, [coupleId]);

  // Synchronize local YouTube Player with incoming Firestore state
  const syncLocalPlayerWithState = (data: CurrentTrack, prevData: CurrentTrack | null) => {
    if (!playerRef.current || !playerRef.current.loadVideoById) return;

    const updatedAtMs = data.updatedAt?.toDate
      ? data.updatedAt.toDate().getTime()
      : Date.now();
    // Only calculate elapsedSec if track is actively playing! If paused, elapsedSec is 0.
    const elapsedSec = data.isPlaying && data.updatedAt?.toDate
      ? Math.max(0, (Date.now() - updatedAtMs) / 1000)
      : 0;
    const expectedPos = Math.max(0, data.positionAtUpdate + elapsedSec);

    // If video changed
    if (!prevData || prevData.videoId !== data.videoId) {
      playerRef.current.loadVideoById({
        videoId: data.videoId,
        startSeconds: expectedPos,
      });

      if (data.isPlaying) {
        if (playerRef.current.unMute) playerRef.current.unMute();
        if (playerRef.current.setVolume) playerRef.current.setVolume(localVolume);
        playerRef.current.playVideo();

        setTimeout(() => {
          if (!playerRef.current || !playerRef.current.getPlayerState) return;
          const st = playerRef.current.getPlayerState();
          if (st !== 1 && st !== 3) {
            setPendingAutoplayJoin(true);
          } else {
            setPendingAutoplayJoin(false);
          }
        }, 800);
      } else {
        playerRef.current.pauseVideo();
        setPendingAutoplayJoin(false);
      }
      return;
    }

    // Matching videoId — sync play/pause & position
    if (data.isPlaying) {
      const actualPos = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
      const drift = Math.abs(actualPos - expectedPos);
      setMeasuredDriftSec(parseFloat(drift.toFixed(2)));

      if (drift > 1.5) {
        playerRef.current.seekTo(expectedPos, true);
      }

      if (playerRef.current.getPlayerState() !== 1) {
        if (playerRef.current.unMute) playerRef.current.unMute();
        if (playerRef.current.setVolume) playerRef.current.setVolume(localVolume);
        playerRef.current.playVideo();

        setTimeout(() => {
          if (!playerRef.current || !playerRef.current.getPlayerState) return;
          const st = playerRef.current.getPlayerState();
          if (st !== 1 && st !== 3) {
            setPendingAutoplayJoin(true);
          } else {
            setPendingAutoplayJoin(false);
          }
        }, 800);
      } else {
        setPendingAutoplayJoin(false);
      }
    } else {
      if (playerRef.current.pauseVideo) {
        playerRef.current.pauseVideo();
      }
      if (data.positionAtUpdate !== undefined) {
        playerRef.current.seekTo(data.positionAtUpdate, true);
      }
      setPendingAutoplayJoin(false);
    }
  };

  // 5. High-frequency 500ms ticker for currentTime & duration sync
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;

    const interval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        const cur = playerRef.current.getCurrentTime();
        if (typeof cur === "number" && !isNaN(cur) && cur >= 0) {
          setCurrentTime(Math.floor(cur));
        }
      }
      if (playerRef.current && typeof playerRef.current.getDuration === "function") {
        const dur = playerRef.current.getDuration();
        if (typeof dur === "number" && !isNaN(dur) && dur > 0) {
          setDuration(Math.floor(dur));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlayerReady, currentTrack?.isPlaying]);

  // Reset currentTime/duration when track changes or unmounts
  useEffect(() => {
    if (!currentTrack) {
      setCurrentTime(0);
      setDuration(0);
    }
  }, [currentTrack?.videoId]);

  // 6. Periodic 5-second Drift Correction Loop
  useEffect(() => {
    if (!currentTrack?.isPlaying || !isPlayerReady || !playerRef.current) return;

    const interval = setInterval(() => {
      if (!currentTrackRef.current || !currentTrackRef.current.isPlaying) return;

      const data = currentTrackRef.current;
      const updatedAtMs = data.updatedAt?.toDate
        ? data.updatedAt.toDate().getTime()
        : Date.now();
      const elapsedSec = (Date.now() - updatedAtMs) / 1000;
      const expectedPos = Math.max(0, data.positionAtUpdate + elapsedSec);

      const actualPos = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
      const drift = Math.abs(actualPos - expectedPos);
      setMeasuredDriftSec(parseFloat(drift.toFixed(2)));

      if (drift > 1.5) {
        console.log(`Drift ${drift.toFixed(2)}s > 1.5s threshold — silently seeking to ${expectedPos.toFixed(1)}s`);
        playerRef.current.seekTo(expectedPos, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentTrack?.isPlaying, isPlayerReady]);

  // User Action: Join Sync Playback (satisfies browser autoplay gesture)
  const joinSyncPlayback = () => {
    setPendingAutoplayJoin(false);
    if (!currentTrack || !playerRef.current) return;

    const updatedAtMs = currentTrack.updatedAt?.toDate
      ? currentTrack.updatedAt.toDate().getTime()
      : Date.now();
    const elapsedSec = (Date.now() - updatedAtMs) / 1000;
    const expectedPos = Math.max(0, currentTrack.positionAtUpdate + elapsedSec);

    if (playerRef.current.unMute) playerRef.current.unMute();
    if (playerRef.current.setVolume) playerRef.current.setVolume(localVolume);
    playerRef.current.seekTo(expectedPos, true);
    playerRef.current.playVideo();
  };

  // User Action: Play Track Immediately
  const playTrack = async (track: Track) => {
    if (!coupleId || !user?.uid) return;

    setCurrentTime(0);
    const currentDocRef = doc(db, "couples", coupleId, "music", "current");
    await setDoc(currentDocRef, {
      videoId: track.videoId,
      title: track.title,
      thumbnail: track.thumbnail,
      channelTitle: track.channelTitle,
      isPlaying: true,
      positionAtUpdate: 0,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  };

  // User Action: Toggle Play / Pause (preserves paused timestamp)
  const togglePlayPause = async () => {
    if (!coupleId || !user?.uid || !currentTrack) return;

    let currentPos = currentTrack.positionAtUpdate;
    if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
      const p = playerRef.current.getCurrentTime();
      if (typeof p === "number" && !isNaN(p) && p >= 0) {
        currentPos = Math.floor(p);
      }
    }

    const currentDocRef = doc(db, "couples", coupleId, "music", "current");
    await setDoc(
      currentDocRef,
      {
        isPlaying: !currentTrack.isPlaying,
        positionAtUpdate: currentPos,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
  };

  // User Action: Seek to Position
  const seekTo = async (seconds: number) => {
    if (!coupleId || !user?.uid || !currentTrack) return;

    setCurrentTime(seconds);
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(seconds, true);
    }

    const currentDocRef = doc(db, "couples", coupleId, "music", "current");
    await setDoc(
      currentDocRef,
      {
        positionAtUpdate: seconds,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
  };

  // User Action: Add Track to Queue (Fractional Order = Date.now())
  const addToQueue = async (track: Track) => {
    if (!coupleId || !user?.uid) return;

    const queueCollRef = collection(db, "couples", coupleId, "musicQueue");
    await setDoc(doc(queueCollRef), {
      videoId: track.videoId,
      title: track.title,
      thumbnail: track.thumbnail,
      channelTitle: track.channelTitle,
      order: Date.now(),
      addedBy: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  // User Action: Remove Item from Queue
  const removeFromQueue = async (itemId: string) => {
    if (!coupleId) return;

    const itemDocRef = doc(db, "couples", coupleId, "musicQueue", itemId);
    await deleteDoc(itemDocRef);
  };

  // User Action: Reorder Queue Item (Single-Doc Write using fractional/sparse order)
  const reorderQueueItem = async (itemId: string, newOrder: number) => {
    if (!coupleId) return;

    const itemDocRef = doc(db, "couples", coupleId, "musicQueue", itemId);
    await updateDoc(itemDocRef, { order: newOrder });
  };

  // Atomic Track-End Handler: Advances to next song via Firestore Transaction using queueRef
  const handleTrackEnd = async () => {
    if (!coupleId || !user?.uid || !currentTrackRef.current) return;

    const currentDocRef = doc(db, "couples", coupleId, "music", "current");
    const endingVideoId = currentTrackRef.current.videoId;
    const activeQueue = queueRef.current;
    const nextQueueItem = activeQueue.length > 0 ? activeQueue[0] : null;

    try {
      await runTransaction(db, async (tx) => {
        const currentSnap = await tx.get(currentDocRef);
        if (!currentSnap.exists()) return;

        const liveCurrent = currentSnap.data() as CurrentTrack;
        // Confirm videoId still matches to prevent duplicate/stale triggers
        if (liveCurrent.videoId !== endingVideoId) return;

        if (nextQueueItem) {
          const nextDocRef = doc(
            db,
            "couples",
            coupleId,
            "musicQueue",
            nextQueueItem.id
          );
          const nextSnap = await tx.get(nextDocRef);

          if (nextSnap.exists()) {
            const nextTrackData = nextSnap.data() as Track;
            tx.delete(nextDocRef);
            tx.set(currentDocRef, {
              videoId: nextTrackData.videoId,
              title: nextTrackData.title,
              thumbnail: nextTrackData.thumbnail,
              channelTitle: nextTrackData.channelTitle,
              isPlaying: true,
              positionAtUpdate: 0,
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            });
          }
        } else {
          // Queue empty -> Stop playback cleanly and remain paused at end
          tx.set(currentDocRef, {
            videoId: endingVideoId,
            title: currentTrackRef.current?.title || "",
            thumbnail: currentTrackRef.current?.thumbnail || "",
            channelTitle: currentTrackRef.current?.channelTitle || "",
            isPlaying: false,
            positionAtUpdate: 0,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      });
    } catch (err) {
      console.error("Error advancing queue transaction:", err);
    }
  };

  // User Action: Skip Next Track
  const skipNextTrack = async () => {
    await handleTrackEnd();
  };

  // User Action: Set Local Volume (100% per-device, never synced)
  const setLocalVolume = (vol: number) => {
    setLocalVolumeState(vol);
    if (typeof window !== "undefined") {
      localStorage.setItem("moi_music_volume", vol.toString());
    }
    if (playerRef.current?.setVolume) {
      playerRef.current.setVolume(vol);
    }
  };

  // Search Proxy API Function
  const searchTracks = async (q: string): Promise<Track[]> => {
    try {
      setSearchWarning(null);
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`, {
        headers: {
          Authorization: `Bearer ${user?.uid || "authenticated"}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Proxy error ${res.status}`);
      }

      const data = await res.json();
      if (data.warning) {
        setSearchWarning(data.warning);
      }
      return data.tracks || [];
    } catch (err: any) {
      console.error("Failed to search tracks:", err);
      setSearchWarning("Search temporarily unavailable. Showing suggestions.");
      return [];
    }
  };

  return (
    <MusicContext.Provider
      value={{
        currentTrack,
        queue,
        isPlaying: currentTrack?.isPlaying || false,
        localVolume,
        isPlayerReady,
        pendingAutoplayJoin,
        measuredDriftSec,
        searchWarning,
        currentTime,
        duration,
        playTrack,
        togglePlayPause,
        seekTo,
        addToQueue,
        removeFromQueue,
        reorderQueueItem,
        skipNextTrack,
        setLocalVolume,
        joinSyncPlayback,
        searchTracks,
      }}
    >
      {/* Off-Screen Global YouTube IFrame Player Instance */}
      <div
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div id="global-yt-player-container" />
      </div>
      {children}
    </MusicContext.Provider>
  );
}
