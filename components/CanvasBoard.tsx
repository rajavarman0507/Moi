"use client";

import React, { useRef, useEffect, useState } from "react";
import { getRtdb } from "@/lib/firebase";
import { ref, onValue, set, remove } from "firebase/database";
import { Eraser, RotateCcw, Palette } from "lucide-react";

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
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const strokesRef = ref(getRtdb(), `presence/${coupleId}/sketchStrokes`);

  // Draw strokes onto HTML5 Canvas
  const renderStrokes = (strokes: StrokePoint[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let lastPoint: StrokePoint | null = null;
    strokes.forEach((pt) => {
      if (pt.isNewStroke || !lastPoint) {
        ctx.beginPath();
        ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
      } else {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x * canvas.width, lastPoint.y * canvas.height);
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.width;
        ctx.stroke();
      }
      lastPoint = pt;
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
      renderStrokes(strokeList);
    });

    return () => unsubscribe();
  }, [coupleId]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    setIsDrawing(true);
    addPoint(e, true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawing) return;
    addPoint(e, false);
  };

  const handleMouseUp = () => {
    if (!isDrawer) return;
    setIsDrawing(false);
  };

  const addPoint = (e: React.MouseEvent<HTMLCanvasElement>, isNewStroke: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const rtdb = getRtdb();
    const pointRef = ref(rtdb, `presence/${coupleId}/sketchStrokes/${Date.now()}_${Math.random()}`);
    set(pointRef, {
      x,
      y,
      color,
      width: lineWidth,
      isNewStroke,
    });
  };

  const handleClearCanvas = () => {
    if (!isDrawer) return;
    remove(strokesRef);
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-[#180611] rounded-2xl border border-rose-500/30 overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={600}
          height={340}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full ${isDrawer ? "cursor-crosshair" : "cursor-default"}`}
        />
      </div>

      {/* Drawer Control Toolbar */}
      {isDrawer && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-wine-950/70 border border-rose-500/20 rounded-2xl">
          {/* Color Options */}
          <div className="flex items-center space-x-2">
            <Palette className="w-4 h-4 text-rose-300" />
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border border-white/20 transition-transform ${
                  color === c ? "scale-125 border-white shadow-glow" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Stroke Width & Clear */}
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min={2}
              max={16}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20 accent-rose-500"
            />

            <button
              onClick={handleClearCanvas}
              className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-xs font-semibold text-rose-300 flex items-center space-x-1"
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
