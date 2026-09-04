"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WaitingForPartner from "@/components/WaitingForPartner";
import {
  Pencil,
  Eraser,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  Smile,
  Type,
  Undo2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface StrokePoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
}

interface DoodleElement {
  id: string;
  type: "stroke" | "eraser" | "text" | "emoji";
  points?: StrokePoint[];
  color?: string;
  width?: number;
  text?: string;
  emoji?: string;
  x?: number; // Normalized 0..1
  y?: number; // Normalized 0..1
  textSize?: number;
  emojiSize?: number;
  authorUid?: string;
  authorName?: string;
  createdAt?: any;
}

const COLORS = ["#FB7185", "#FDE047", "#60A5FA", "#34D399", "#A78BFA", "#FFFFFF", "#000000"];

const EMOJIS = [
  "❤️", "💕", "💖", "💗", "💓", "💞", "💘", "💌",
  "😘", "💋", "😍", "🥰", "🥳", "🤩", "🌟", "✨",
  "🌸", "🌺", "🌹", "🌷", "🌻", "👑", "🎨", "🧸",
  "🍦", "🧁", "🍓", "🍒", "🎂", "🎉", "🔥", "🐱",
  "🐣", "🦋", "💍", "🎁", "💯", "🎈", "🍀", "💎",
  "⭐", "🎵", "☕", "🍿", "🚗", "🌈", "☀️", "🌙"
];

function dataURItoBlob(dataURI: string): Blob {
  const byteString = atob(dataURI.split(",")[1]);
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

export default function DoodlePage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTool, setActiveTool] = useState<"draw" | "erase" | "emoji" | "text">("draw");
  const [selectedColor, setSelectedColor] = useState<string>("#FB7185");
  const [lineWidth, setLineWidth] = useState<number>(6);
  const [eraserWidth, setEraserWidth] = useState<number>(24);

  // Emoji & Text Tool States
  const [selectedEmoji, setSelectedEmoji] = useState<string>("❤️");
  const [emojiSize, setEmojiSize] = useState<number>(36);

  const [textInput, setTextInput] = useState<string>("Love You ♥");
  const [textSize, setTextSize] = useState<number>(28);

  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [elements, setElements] = useState<DoodleElement[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const currentStrokePoints = useRef<StrokePoint[]>([]);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";
  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);
  const coupleId = couple?.id;

  // Render all elements onto canvas
  const renderAllElements = (els: DoodleElement[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset background
    ctx.fillStyle = "#180611";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    els.forEach((el) => {
      if ((el.type === "stroke" || el.type === "eraser") && el.points && el.points.length > 0) {
        const isEraser = el.type === "eraser";
        const strokeColor = isEraser ? "#180611" : (el.color || "#FB7185");
        const strokeSize = isEraser ? (el.width || 24) : (el.width || 6);

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (el.points.length === 1) {
          const pt = el.points[0];
          ctx.beginPath();
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, strokeSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = strokeColor;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x * canvas.width, el.points[0].y * canvas.height);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x * canvas.width, el.points[i].y * canvas.height);
          }
          ctx.stroke();
        }
      } else if (el.type === "text" && el.text && el.x !== undefined && el.y !== undefined) {
        const posX = el.x * canvas.width;
        const posY = el.y * canvas.height;
        const size = el.textSize || 28;

        ctx.font = `bold ${size}px sans-serif`;
        ctx.fillStyle = el.color || "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.text, posX, posY);
      } else if (el.type === "emoji" && el.emoji && el.x !== undefined && el.y !== undefined) {
        const posX = el.x * canvas.width;
        const posY = el.y * canvas.height;
        const size = el.emojiSize || 36;

        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.emoji, posX, posY);
      }
    });
  };

  // Real-time 2-Way Sync via Firestore Subcollection (couples/{coupleId}/doodleItems)
  useEffect(() => {
    if (!coupleId) return;

    const itemsCollRef = collection(db, "couples", coupleId, "doodleItems");
    const q = query(itemsCollRef, limit(300));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const loaded: DoodleElement[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as DoodleElement[];

        // Sort chronologically in memory
        loaded.sort((a, b) => {
          const tA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
          const tB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
          return tA - tB;
        });

        setElements(loaded);
        renderAllElements(loaded);
      },
      (err) => console.error("Doodle onSnapshot sync error:", err)
    );

    return () => unsubscribe();
  }, [coupleId]);

  const getNormCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return {
      normX: Math.max(0, Math.min(1, x)),
      normY: Math.max(0, Math.min(1, y)),
    };
  };

  const handleStart = (clientX: number, clientY: number) => {
    const coords = getNormCoords(clientX, clientY);
    if (!coords || !coupleId) return;

    if (activeTool === "emoji") {
      // Stamp Emoji -> Push to Firestore for live 2-way sync!
      const itemsCollRef = collection(db, "couples", coupleId, "doodleItems");
      addDoc(itemsCollRef, {
        type: "emoji",
        emoji: selectedEmoji,
        emojiSize,
        x: coords.normX,
        y: coords.normY,
        authorUid: user?.uid,
        authorName: myName,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error("Error adding emoji item:", err));
      return;
    }

    if (activeTool === "text" && textInput.trim()) {
      // Place Text Note -> Push to Firestore for live 2-way sync!
      const itemsCollRef = collection(db, "couples", coupleId, "doodleItems");
      addDoc(itemsCollRef, {
        type: "text",
        text: textInput.trim(),
        color: selectedColor,
        textSize,
        x: coords.normX,
        y: coords.normY,
        authorUid: user?.uid,
        authorName: myName,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error("Error adding text item:", err));
      return;
    }

    if (activeTool === "draw" || activeTool === "erase") {
      setIsDrawing(true);
      currentStrokePoints.current = [{ x: coords.normX, y: coords.normY }];
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDrawing || (activeTool !== "draw" && activeTool !== "erase")) return;
    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    currentStrokePoints.current.push({ x: coords.normX, y: coords.normY });

    // Temporary local preview while dragging
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx && currentStrokePoints.current.length > 1) {
        const pts = currentStrokePoints.current;
        const p1 = pts[pts.length - 2];
        const p2 = pts[pts.length - 1];
        const isEraser = activeTool === "erase";
        const strokeSize = isEraser ? eraserWidth : lineWidth;

        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.strokeStyle = isEraser ? "#180611" : selectedColor;
        ctx.lineWidth = strokeSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
  };

  const handleEnd = () => {
    if (!isDrawing || (activeTool !== "draw" && activeTool !== "erase")) return;
    setIsDrawing(false);

    if (currentStrokePoints.current.length > 0 && coupleId) {
      const itemsCollRef = collection(db, "couples", coupleId, "doodleItems");
      const isEraser = activeTool === "erase";

      addDoc(itemsCollRef, {
        type: isEraser ? "eraser" : "stroke",
        points: currentStrokePoints.current,
        color: isEraser ? "#180611" : selectedColor,
        width: isEraser ? eraserWidth : lineWidth,
        authorUid: user?.uid,
        authorName: myName,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error("Error adding stroke item:", err));
    }

    currentStrokePoints.current = [];
  };

  // Undo Action: Delete latest element from Firestore
  const handleUndo = async () => {
    if (!coupleId || elements.length === 0) return;
    const lastElement = elements[elements.length - 1];
    try {
      const itemDocRef = doc(db, "couples", coupleId, "doodleItems", lastElement.id);
      await deleteDoc(itemDocRef);
    } catch (err) {
      console.error("Error undoing doodle element:", err);
    }
  };

  // Chunked Batch Clear Board for Both Partners
  const handleConfirmClearCanvas = async () => {
    if (!coupleId) return;
    setIsClearing(true);

    try {
      const itemsCollRef = collection(db, "couples", coupleId, "doodleItems");
      const allDocsSnap = await getDocs(itemsCollRef);
      const docSnaps = allDocsSnap.docs;

      for (let i = 0; i < docSnaps.length; i += 400) {
        const chunk = docSnaps.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      setElements([]);
      renderAllElements([]);
    } catch (err) {
      console.error("Error clearing doodle canvas:", err);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  // Fast & Bulletproof Save Canvas Action -> Saves to Sketches in Shared Moments
  const handleSaveCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !coupleId) return;

    setIsSaving(true);

    try {
      const dataUrl = canvas.toDataURL("image/png");
      let imageUrl = dataUrl;

      // Try uploading to Cloud Storage with a 4-second timeout, falling back gracefully to Data URL
      try {
        const blob = dataURItoBlob(dataUrl);
        const sketchId = `sketch_${Date.now()}`;
        const storageRef = ref(storage, `couples/${coupleId}/sketches/${sketchId}.png`);

        const uploadPromise = uploadBytes(storageRef, blob).then(() => getDownloadURL(storageRef));
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Storage timeout")), 4000)
        );

        imageUrl = await Promise.race([uploadPromise, timeoutPromise]);
      } catch (stgErr) {
        console.warn("Storage upload timed out or fallback to DataURL:", stgErr);
      }

      // Add to Shared Moments collection under type: "sketch"
      const momentsCollRef = collection(db, "couples", coupleId, "moments");
      await addDoc(momentsCollRef, {
        type: "sketch",
        title: `${myName}'s Saved Sketch`,
        imageUrl,
        authorName: myName,
        createdAt: serverTimestamp(),
      });

      // Send Notification to Partner if present
      if (partnerUid) {
        const notifCollRef = collection(db, "couples", coupleId, "notifications");
        await addDoc(notifCollRef, {
          toUserId: partnerUid,
          type: "sketch",
          title: `${myName} saved a new Doodle Sketch! 🎨`,
          body: "View it in your Shared Moments gallery under Sketches.",
          imageUrl,
          createdAt: serverTimestamp(),
          read: false,
        }).catch(() => {});
      }

      setSaveSuccess(true);
      setTimeout(() => {
        router.push("/moments");
      }, 1000);
    } catch (err) {
      console.error("Error saving canvas:", err);
      alert("Failed to save sketch. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Live Sync Doodle Studio...</p>
      </div>
    );
  }

  return (
    <WaitingForPartner>
      <div className="space-y-6 relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-rose-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-200 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Live 2-Way Sync Doodle Studio</span>
          </div>
        </div>

        {/* Canvas Studio Card */}
        <div className="moi-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#240A17]/90 via-[#350F22]/90 to-[#190510]/90 border border-rose-500/30 space-y-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Doodle Together Studio</span>
              <Pencil className="w-5 h-5 text-rose-400" />
            </h1>

            <div className="flex items-center space-x-2">
              {/* Undo Action Button */}
              <button
                onClick={handleUndo}
                disabled={elements.length === 0}
                className="px-3 py-1.5 rounded-xl bg-wine-900/80 hover:bg-wine-800 border border-rose-500/30 text-xs font-bold text-rose-200 flex items-center space-x-1.5 transition-all disabled:opacity-40"
                title="Undo last action"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-300" />
                <span>Undo</span>
              </button>

              {/* Clear Action Button */}
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center space-x-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Canvas</span>
              </button>
            </div>
          </div>

          {/* Interactive Live Synchronized HTML5 Canvas */}
          <div className="relative w-full aspect-video bg-[#180611] rounded-2xl border border-rose-500/30 overflow-hidden shadow-inner touch-none">
            <canvas
              ref={canvasRef}
              width={800}
              height={450}
              onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
              onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={(e) => {
                if (e.touches.length > 0) handleStart(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchMove={(e) => {
                if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchEnd={handleEnd}
              className={`w-full h-full ${
                activeTool === "draw"
                  ? "cursor-crosshair"
                  : activeTool === "erase"
                  ? "cursor-pointer"
                  : "cursor-copy"
              }`}
            />
          </div>

          {/* Main Toolbar Controls */}
          <div className="space-y-4 p-4 bg-wine-950/80 border border-rose-500/30 rounded-2xl">
            {/* Tool Selection Tabs: Draw | Erase | Emoji | Text */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center space-x-1.5 bg-wine-900/60 p-1.5 rounded-xl border border-rose-500/20">
                <button
                  onClick={() => setActiveTool("draw")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    activeTool === "draw" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Draw</span>
                </button>

                <button
                  onClick={() => setActiveTool("erase")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    activeTool === "erase" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Erase</span>
                </button>

                <button
                  onClick={() => setActiveTool("emoji")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    activeTool === "emoji" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
                  }`}
                >
                  <Smile className="w-3.5 h-3.5 text-amber-300" />
                  <span>Emoji Stamp ({EMOJIS.length})</span>
                </button>

                <button
                  onClick={() => setActiveTool("text")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                    activeTool === "text" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>Text Note</span>
                </button>
              </div>

              {/* Save Canvas Button */}
              <button
                onClick={handleSaveCanvas}
                disabled={isSaving || saveSuccess}
                className="moi-button-primary px-6 py-2.5 text-xs font-extrabold flex items-center space-x-2 shrink-0"
              >
                <Save className="w-4 h-4 text-amber-300" />
                <span>{isSaving ? "Saving Canvas..." : saveSuccess ? "Saved to Sketches! 🎉" : "Save Canvas"}</span>
              </button>
            </div>

            {/* Active Tool Sub-Panels */}

            {/* 1. DRAW SUB-PANEL */}
            {activeTool === "draw" && (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-rose-900/40">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-rose-300" />
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`w-6 h-6 rounded-full border-2 border-white/20 transition-transform ${
                        selectedColor === c ? "scale-125 border-amber-300 shadow-glow" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs text-rose-300 font-semibold">Line Size:</span>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    value={lineWidth}
                    onChange={(e) => setLineWidth(Number(e.target.value))}
                    className="w-24 accent-rose-500 cursor-pointer"
                  />
                  <span className="text-xs text-white font-mono">{lineWidth}px</span>
                </div>
              </div>
            )}

            {/* 2. ERASE SUB-PANEL */}
            {activeTool === "erase" && (
              <div className="flex items-center space-x-3 pt-2 border-t border-rose-900/40">
                <span className="text-xs text-rose-300 font-semibold">Eraser Size:</span>
                <input
                  type="range"
                  min={8}
                  max={60}
                  value={eraserWidth}
                  onChange={(e) => setEraserWidth(Number(e.target.value))}
                  className="w-40 accent-rose-500 cursor-pointer"
                />
                <span className="text-xs text-white font-mono">{eraserWidth}px</span>
              </div>
            )}

            {/* 3. EMOJI STAMP SUB-PANEL */}
            {activeTool === "emoji" && (
              <div className="space-y-3 pt-2 border-t border-rose-900/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">Click anywhere on canvas to stamp emoji:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-rose-300 font-semibold">Emoji Size:</span>
                    <input
                      type="range"
                      min={20}
                      max={72}
                      value={emojiSize}
                      onChange={(e) => setEmojiSize(Number(e.target.value))}
                      className="w-24 accent-rose-500 cursor-pointer"
                    />
                    <span className="text-xs text-white font-mono">{emojiSize}px</span>
                  </div>
                </div>

                {/* Expanded 48+ Emoji Selector Grid */}
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2.5 bg-wine-900/50 rounded-xl border border-rose-500/20">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setSelectedEmoji(e)}
                      className={`text-xl p-1.5 rounded-xl hover:bg-rose-500/30 transition-transform ${
                        selectedEmoji === e ? "bg-rose-600/40 scale-125 border border-amber-300 shadow-glow" : ""
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. TEXT NOTE SUB-PANEL */}
            {activeTool === "text" && (
              <div className="space-y-3 pt-2 border-t border-rose-900/40">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type text note to place..."
                    className="flex-1 px-4 py-2 rounded-xl bg-[#1B0710] border border-rose-500/30 text-white text-xs font-bold focus:border-rose-400 focus:outline-none"
                    style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                  />

                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-rose-300 font-semibold">Font Size:</span>
                    <input
                      type="range"
                      min={16}
                      max={50}
                      value={textSize}
                      onChange={(e) => setTextSize(Number(e.target.value))}
                      className="w-20 accent-rose-500 cursor-pointer"
                    />
                    <span className="text-xs text-white font-mono">{textSize}px</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`w-5 h-5 rounded-full border border-white/20 transition-transform ${
                          selectedColor === c ? "scale-125 border-amber-300 shadow-glow" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-rose-300/70 font-semibold">
                  Click anywhere on the canvas to place your text note (syncs live to both partners).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="moi-card p-6 max-w-sm w-full bg-gradient-to-br from-[#2F0B1E] to-[#1C0512] border border-rose-500/40 space-y-4 text-center shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">Clear Canvas?</h4>
                <p className="text-xs text-rose-200/70">This will erase all doodles, notes, and emojis for both of you. This cannot be undone.</p>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-xs font-bold text-rose-300/70 hover:text-white">Cancel</button>
                <button onClick={handleConfirmClearCanvas} disabled={isClearing} className="moi-button-primary px-5 py-2 text-xs font-extrabold">
                  {isClearing ? "Clearing..." : "Confirm Clear"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </WaitingForPartner>
  );
}
