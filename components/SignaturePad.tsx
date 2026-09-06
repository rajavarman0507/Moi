"use client";

import React, { useRef, useState, useEffect } from "react";
import { RotateCcw, CheckCircle2, PenTool, Loader2 } from "lucide-react";

interface SignaturePadProps {
  onSign: (signatureDataUrl: string) => Promise<void>;
  disabled?: boolean;
}

export default function SignaturePad({ onSign, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasStrokes, setHasStrokes] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize Canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle high-DPI crisp rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#45122C"; // Deep Rose Burgundy Ink
      ctx.lineWidth = 3;
    }
  }, []);

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || isSubmitting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoordinates(e);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    setIsDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || isSubmitting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoordinates(e);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStrokes(false);
  };

  const handleSignSubmit = async () => {
    if (!hasStrokes || !canvasRef.current || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      await onSign(dataUrl);
    } catch (err) {
      console.error("Signature submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Signature Canvas Box */}
      <div className="relative rounded-2xl bg-[#FFFBF5] border-2 border-rose-900/30 p-2 shadow-inner group">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className="w-full h-44 rounded-xl cursor-crosshair touch-none select-none"
        />

        {/* Baseline Guide */}
        <div className="absolute bottom-6 left-6 right-6 pointer-events-none flex items-center justify-between border-b border-rose-900/20 pb-1">
          <span className="text-[10px] font-mono text-rose-900/40 uppercase tracking-wider">
            Sign on the line above ✒️
          </span>
          <PenTool className="w-3 h-3 text-rose-900/30" />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasStrokes || isSubmitting || disabled}
          className="px-4 py-2.5 rounded-xl bg-wine-900/60 hover:bg-wine-900 border border-rose-500/30 text-xs font-bold text-rose-300 disabled:opacity-40 flex items-center space-x-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear Canvas</span>
        </button>

        <button
          type="button"
          onClick={handleSignSubmit}
          disabled={!hasStrokes || isSubmitting || disabled}
          className="moi-button-primary px-6 py-2.5 text-xs font-extrabold flex items-center space-x-2 shadow-glow disabled:opacity-40"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Encrypting & Signing...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Sign & Attach Signature</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
