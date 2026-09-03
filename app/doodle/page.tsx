"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WaitingForPartner from "@/components/WaitingForPartner";
import {
  Pencil,
  Eraser,
  Palette,
  RotateCcw,
  Send,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface StrokePoint {
  x: number;
  y: number;
}

const COLORS = ["#FB7185", "#FDE047", "#60A5FA", "#34D399", "#A78BFA", "#FFFFFF", "#000000"];

export default function DoodlePage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTool, setActiveTool] = useState<"draw" | "erase">("draw");
  const [selectedColor, setSelectedColor] = useState<string>("#FB7185");
  const [lineWidth, setLineWidth] = useState<number>(6);
  const [eraserWidth, setEraserWidth] = useState<number>(24);

  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendSuccess, setSendSuccess] = useState<boolean>(false);

  const currentStrokePoints = useRef<StrokePoint[]>([]);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";
  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);
  const coupleId = couple?.id;

  // Initialize Canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#180611";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

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
    if (!coords) return;
    setIsDrawing(true);
    currentStrokePoints.current = [{ x: coords.normX, y: coords.normY }];
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDrawing) return;
    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    currentStrokePoints.current.push({ x: coords.normX, y: coords.normY });

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
    setIsDrawing(false);
    currentStrokePoints.current = [];
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#180611";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    setShowClearConfirm(false);
  };

  // Send as Instant Sketch to Shared Moments & Trigger Notification
  const handleSendInstantSketch = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !coupleId || !partnerUid) return;

    setIsSending(true);

    try {
      // 1. Convert Canvas to Blob
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );

      if (!blob) throw new Error("Failed to render canvas image.");

      // 2. Upload PNG to Cloud Storage
      const sketchId = `sketch_${Date.now()}`;
      const storageRef = ref(storage, `couples/${coupleId}/sketches/${sketchId}.png`);
      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);

      // 3. Add to Shared Moments collection
      const momentsCollRef = collection(db, "couples", coupleId, "moments");
      await addDoc(momentsCollRef, {
        type: "sketch",
        title: `${myName}'s Instant Sketch`,
        imageUrl,
        authorName: myName,
        createdAt: serverTimestamp(),
      });

      // 4. Send Firestore-Triggered Notification to Partner
      const notifCollRef = collection(db, "couples", coupleId, "notifications");
      await addDoc(notifCollRef, {
        toUserId: partnerUid,
        type: "sketch",
        title: `${myName} sent an Instant Sketch! 🎨`,
        body: "Click to view your new doodle in Shared Moments.",
        imageUrl,
        createdAt: serverTimestamp(),
        read: false,
      });

      setSendSuccess(true);
      setTimeout(() => {
        router.push("/moments");
      }, 1500);
    } catch (err) {
      console.error("Error sending instant sketch:", err);
    } finally {
      setIsSending(false);
    }
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Doodle Studio...</p>
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
            <span>Standalone Doodle Together</span>
          </div>
        </div>

        {/* Canvas Card */}
        <div className="moi-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#240A17]/90 via-[#350F22]/90 to-[#190510]/90 border border-rose-500/30 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Doodle Together Studio</span>
              <Pencil className="w-5 h-5 text-rose-400" />
            </h1>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center space-x-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Canvas</span>
            </button>
          </div>

          {/* Interactive HTML5 Drawing Canvas */}
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
              className={`w-full h-full ${activeTool === "draw" ? "cursor-crosshair" : "cursor-pointer"}`}
            />
          </div>

          {/* Toolbar & Send Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-wine-950/80 border border-rose-500/30 rounded-2xl">
            {/* Draw / Erase Mode Switch */}
            <div className="flex items-center space-x-2 bg-wine-900/60 p-1 rounded-xl border border-rose-500/20">
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
            </div>

            {/* Palette Options */}
            {activeTool === "draw" && (
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
            )}

            {/* Brush Size Sliders */}
            {activeTool === "draw" ? (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-rose-300 font-semibold">Size:</span>
                <input
                  type="range"
                  min={2}
                  max={20}
                  value={lineWidth}
                  onChange={(e) => setLineWidth(Number(e.target.value))}
                  className="w-20 accent-rose-500 cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-rose-300 font-semibold">Eraser Size:</span>
                <input
                  type="range"
                  min={8}
                  max={45}
                  value={eraserWidth}
                  onChange={(e) => setEraserWidth(Number(e.target.value))}
                  className="w-24 accent-rose-500 cursor-pointer"
                />
              </div>
            )}

            {/* Send Instant Sketch Button */}
            <button
              onClick={handleSendInstantSketch}
              disabled={isSending || sendSuccess}
              className="moi-button-primary px-6 py-2.5 text-xs font-extrabold flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? "Uploading Sketch..." : sendSuccess ? "Sent to Moments! 🎉" : `Send to ${partnerName}`}</span>
            </button>
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
                <p className="text-xs text-rose-200/70">This will erase your current drawing. This cannot be undone.</p>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-xs font-bold text-rose-300/70 hover:text-white">Cancel</button>
                <button onClick={handleClearCanvas} className="moi-button-primary px-5 py-2 text-xs font-extrabold">Confirm Clear</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </WaitingForPartner>
  );
}
