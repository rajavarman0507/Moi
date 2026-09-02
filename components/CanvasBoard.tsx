"use client";

import React, { useRef, useEffect, useState } from "react";
import { getRtdb } from "@/lib/firebase";
import { ref, onValue, set, remove } from "firebase/database";
import { RotateCcw, Palette } from "lucide-react";

interface StrokePoint {
  x: number;
  y: number;
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
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const strokesRef = ref(getRtdb(), `presence/${coupleId}/sketchStrokes`);

  // Draw points onto canvas
  const drawLineSegment = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    strokeColor: string,
    width: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const renderAllStrokes = (strokes: StrokePoint[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let prev: StrokePoint | null = null;
    strokes.forEach((pt) => {
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
        drawLineSegment(ctx, prevX, prevY, realX, realY, pt.color, pt.width);
      }
      prev = pt;
    });
  };

  // Sync strokes from RTDB in real time
  useEffect(() => {
    const unsubscribe = onValue(strokesRef, (snapshot) => {
      const val = snapshot.val();
      if (!val) {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      const strokeList: StrokePoint[] = Object.values(val);
      renderAllStrokes(strokeList);
    });

    return () => unsubscribe();
  }, [coupleId]);

  // Coordinates helper
  const getCanvasCoordinates = (
    clientX: number,
    clientY: number
  ): { normX: number; normY: number; realX: number; realY: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;
    const realX = normX * canvas.width;
    const realY = normY * canvas.height;
    return { normX, normY, realX, realY };
  };

  // Mouse & Touch Handlers
  const startDrawing = (clientX: number, clientY: number) => {
    if (!isDrawer) return;
    setIsDrawing(true);

    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords) return;

    lastPointRef.current = { x: coords.realX, y: coords.realY };

    // Draw locally first
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(coords.realX, coords.realY, lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    // Push to RTDB
    pushPointToRtdb(coords.normX, coords.normY, true);
  };

  const drawMove = (clientX: number, clientY: number) => {
    if (!isDrawer || !isDrawing) return;

    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords) return;

    // Draw line locally
    if (lastPointRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        drawLineSegment(
          ctx,
          lastPointRef.current.x,
          lastPointRef.current.y,
          coords.realX,
          coords.realY,
          color,
          lineWidth
        );
      }
    }

    lastPointRef.current = { x: coords.realX, y: coords.realY };

    // Push to RTDB
    pushPointToRtdb(coords.normX, coords.normY, false);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const pushPointToRtdb = (normX: number, normY: number, isNewStroke: boolean) => {
    try {
      const rtdb = getRtdb();
      const pointRef = ref(rtdb, `presence/${coupleId}/sketchStrokes/${Date.now()}_${Math.random()}`);
      set(pointRef, {
        x: normX,
        y: normY,
        color,
        width: lineWidth,
        isNewStroke,
      });
    } catch (err) {
      console.error("RTDB stroke push error:", err);
    }
  };

  const handleClearCanvas = () => {
    if (!isDrawer) return;
    try {
      remove(strokesRef);
    } catch (err) {
      console.error("Clear canvas error:", err);
    }
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
          className={`w-full h-full ${isDrawer ? "cursor-crosshair" : "cursor-default"}`}
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
