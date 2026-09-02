"use client";

import React, { useRef, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { RotateCcw, Palette } from "lucide-react";

interface StrokePoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  color: string;
  width: number;
  isNewStroke?: boolean;
}

interface CanvasBoardProps {
  coupleId: string;
  isDrawer: boolean;
}

const COLORS = ["#FB7185", "#FDE047", "#60A5FA", "#34D399", "#A78BFA", "#FFFFFF", "#000000"];

export default function CanvasBoard({ coupleId, isDrawer }: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState<string>("#FB7185");
  const [lineWidth, setLineWidth] = useState<number>(5);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const localPointsRef = useRef<StrokePoint[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const strokesDocRef = doc(db, "couples", coupleId, "sketchStrokes", "current");

  // Render points on canvas
  const renderAllPoints = (points: StrokePoint[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let prev: StrokePoint | null = null;
    points.forEach((pt) => {
      const realX = pt.x * canvas.width;
      const realY = pt.y * canvas.height;

      if (pt.isNewStroke || !prev) {
        ctx.beginPath();
        ctx.arc(realX, realY, pt.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.fill();
      } else {
        const prevX = prev.x * canvas.width;
        const prevY = prev.y * canvas.height;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(realX, realY);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      prev = pt;
    });
  };

  // Subscribe to Firestore stroke document in real-time for both partners
  useEffect(() => {
    if (!coupleId) return;

    const unsubscribe = onSnapshot(strokesDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const points: StrokePoint[] = data.points || [];
        localPointsRef.current = points;
        renderAllPoints(points);
      } else {
        localPointsRef.current = [];
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [coupleId]);

  // Coordinate normalizer (0..1)
  const getNormCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const startDrawing = (clientX: number, clientY: number) => {
    if (!isDrawer) return; // Only drawer can draw!
    setIsDrawing(true);

    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    const newPt: StrokePoint = {
      x: coords.x,
      y: coords.y,
      color,
      width: lineWidth,
      isNewStroke: true,
    };

    const updated = [...localPointsRef.current, newPt];
    localPointsRef.current = updated;
    renderAllPoints(updated);
    savePointsToFirestore(updated);
  };

  const drawMove = (clientX: number, clientY: number) => {
    if (!isDrawer || !isDrawing) return; // Only drawer can draw!

    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    const newPt: StrokePoint = {
      x: coords.x,
      y: coords.y,
      color,
      width: lineWidth,
      isNewStroke: false,
    };

    const updated = [...localPointsRef.current, newPt];
    localPointsRef.current = updated;
    renderAllPoints(updated);

    savePointsThrottled(updated);
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);
    savePointsToFirestore(localPointsRef.current);
  };

  const savePointsThrottled = (points: StrokePoint[]) => {
    if (saveTimeoutRef.current) return;
    saveTimeoutRef.current = setTimeout(() => {
      savePointsToFirestore(points);
      saveTimeoutRef.current = null;
    }, 60);
  };

  const savePointsToFirestore = async (points: StrokePoint[]) => {
    try {
      await setDoc(strokesDocRef, {
        points,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error saving strokes to Firestore:", err);
    }
  };

  const handleClearCanvas = async () => {
    if (!isDrawer) return; // Only drawer can clear!
    localPointsRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    await setDoc(strokesDocRef, {
      points: [],
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-[#180611] rounded-2xl border border-rose-500/30 overflow-hidden shadow-inner touch-none">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          onMouseDown={(e) => startDrawing(e.clientX, e.clientY)}
          onMouseMove={(e) => drawMove(e.clientX, e.clientY)}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={(e) => {
            if (e.touches.length > 0) startDrawing(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            if (e.touches.length > 0) drawMove(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={stopDrawing}
          className={`w-full h-full ${isDrawer ? "cursor-crosshair" : "cursor-default pointer-events-none"}`}
        />
      </div>

      {/* Drawer Control Toolbar */}
      {isDrawer && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-wine-950/90 border border-rose-500/30 rounded-2xl">
          {/* Color Options */}
          <div className="flex items-center space-x-2">
            <Palette className="w-4 h-4 text-rose-300" />
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 border-white/20 transition-transform ${
                  color === c ? "scale-125 border-amber-300 shadow-glow" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Stroke Width & Clear */}
          <div className="flex items-center space-x-3">
            <span className="text-xs text-rose-300 font-semibold">Size:</span>
            <input
              type="range"
              min={3}
              max={20}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-24 accent-rose-500 cursor-pointer"
            />

            <button
              onClick={handleClearCanvas}
              className="px-3.5 py-1.5 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 text-xs font-bold text-rose-200 flex items-center space-x-1.5 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
