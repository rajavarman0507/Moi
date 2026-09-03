"use client";

import React, { useRef, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import {
  Pencil,
  Type,
  Smile,
  RotateCcw,
  Palette,
  Sparkles,
  Send,
  X,
} from "lucide-react";

interface StrokePoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
}

export interface NoticeElement {
  id: string;
  type: "stroke" | "text" | "emoji";
  points?: StrokePoint[];
  color?: string;
  width?: number;
  text?: string;
  emoji?: string;
  x?: number; // Normalized 0..1
  y?: number; // Normalized 0..1
  authorName?: string;
}

const COLORS = ["#FB7185", "#FDE047", "#60A5FA", "#34D399", "#A78BFA", "#FFFFFF", "#000000"];
const EMOJIS = ["❤️", "🥰", "✨", "🌹", "💌", "💍", "💋", "☕", "🎉", "🐥"];

type ActiveTool = "draw" | "text" | "emoji";

export default function NoticeBoardCanvas() {
  const { user, couple, userProfile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>("draw");
  const [selectedColor, setSelectedColor] = useState<string>("#FB7185");
  const [selectedEmoji, setSelectedEmoji] = useState<string>("❤️");
  const [lineWidth, setLineWidth] = useState<number>(5);

  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [elements, setElements] = useState<NoticeElement[]>([]);
  const currentStrokePoints = useRef<StrokePoint[]>([]);

  // Text Note Input Modal state
  const [textModalPos, setTextModalPos] = useState<{ x: number; y: number; normX: number; normY: number } | null>(null);
  const [noteInputText, setNoteInputText] = useState<string>("");

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";

  const docRef = couple?.id ? doc(db, "couples", couple.id, "noticeBoard", "current") : null;

  // Render elements onto HTML5 canvas
  const renderAllElements = (els: NoticeElement[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    els.forEach((el) => {
      if (el.type === "stroke" && el.points && el.points.length > 0) {
        ctx.strokeStyle = el.color || "#FB7185";
        ctx.lineWidth = el.width || 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (el.points.length === 1) {
          const pt = el.points[0];
          ctx.beginPath();
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, (el.width || 5) / 2, 0, Math.PI * 2);
          ctx.fillStyle = el.color || "#FB7185";
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

        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = el.color || "#FFFFFF";
        ctx.fillText(el.text, posX, posY);
      } else if (el.type === "emoji" && el.emoji && el.x !== undefined && el.y !== undefined) {
        const posX = el.x * canvas.width;
        const posY = el.y * canvas.height;

        ctx.font = "30px sans-serif";
        ctx.fillText(el.emoji, posX, posY);
      }
    });
  };

  // Subscribe to Firestore noticeBoard document in real-time
  useEffect(() => {
    if (!docRef) return;

    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loaded: NoticeElement[] = data.elements || [];
        setElements(loaded);
        renderAllElements(loaded);
      } else {
        setElements([]);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });

    return () => unsubscribe();
  }, [couple]);

  // Coordinate helper
  const getNormCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const normX = Math.max(0, Math.min(1, x));
    const normY = Math.max(0, Math.min(1, y));
    const realX = clientX - rect.left;
    const realY = clientY - rect.top;
    return { normX, normY, realX, realY };
  };

  // Canvas Mouse & Touch Handlers
  const handleStart = (clientX: number, clientY: number) => {
    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    if (activeTool === "draw") {
      setIsDrawing(true);
      currentStrokePoints.current = [{ x: coords.normX, y: coords.normY }];
    } else if (activeTool === "text") {
      setTextModalPos({
        x: coords.realX,
        y: coords.realY,
        normX: coords.normX,
        normY: coords.normY,
      });
      setNoteInputText("");
    } else if (activeTool === "emoji") {
      const newEmojiEl: NoticeElement = {
        id: `emoji_${Date.now()}_${Math.random()}`,
        type: "emoji",
        emoji: selectedEmoji,
        x: coords.normX,
        y: coords.normY,
        authorName: myName,
      };
      const updated = [...elements, newEmojiEl];
      setElements(updated);
      renderAllElements(updated);
      saveElementsToFirestore(updated);
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (activeTool !== "draw" || !isDrawing) return;

    const coords = getNormCoords(clientX, clientY);
    if (!coords) return;

    currentStrokePoints.current.push({ x: coords.normX, y: coords.normY });

    // Render temporary stroke live
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx && currentStrokePoints.current.length > 1) {
        const pts = currentStrokePoints.current;
        const p1 = pts[pts.length - 2];
        const p2 = pts[pts.length - 1];

        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
  };

  const handleEnd = () => {
    if (activeTool !== "draw" || !isDrawing) return;
    setIsDrawing(false);

    if (currentStrokePoints.current.length > 0) {
      const newStrokeEl: NoticeElement = {
        id: `stroke_${Date.now()}_${Math.random()}`,
        type: "stroke",
        points: currentStrokePoints.current,
        color: selectedColor,
        width: lineWidth,
        authorName: myName,
      };
      const updated = [...elements, newStrokeEl];
      setElements(updated);
      saveElementsToFirestore(updated);
    }
    currentStrokePoints.current = [];
  };

  // Submit Text Note
  const handleAddTextNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textModalPos || !noteInputText.trim()) return;

    const newTextEl: NoticeElement = {
      id: `text_${Date.now()}_${Math.random()}`,
      type: "text",
      text: noteInputText.trim(),
      color: selectedColor,
      x: textModalPos.normX,
      y: textModalPos.normY,
      authorName: myName,
    };

    const updated = [...elements, newTextEl];
    setElements(updated);
    renderAllElements(updated);
    saveElementsToFirestore(updated);

    setTextModalPos(null);
    setNoteInputText("");
  };

  // Save to Firestore
  const saveElementsToFirestore = async (newEls: NoticeElement[]) => {
    if (!docRef) return;
    try {
      await setDoc(docRef, {
        elements: newEls,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error saving notice board to Firestore:", err);
    }
  };

  const handleClearBoard = async () => {
    setElements([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (docRef) {
      await setDoc(docRef, {
        elements: [],
        updatedAt: serverTimestamp(),
      });
    }
  };

  return (
    <div className="moi-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#240A17]/90 via-[#350F22]/90 to-[#190510]/90 border border-rose-500/30 space-y-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-300">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Shared Couple Notice & Doodle Board</span>
        </div>

        <button
          onClick={handleClearBoard}
          className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center space-x-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear Board</span>
        </button>
      </div>

      {/* Canvas Area */}
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
              : activeTool === "text"
              ? "cursor-text"
              : "cursor-pointer"
          }`}
        />

        {/* Text Note Popover Modal inside Canvas */}
        {textModalPos && (
          <div
            className="absolute z-30 p-3 bg-wine-950/95 border border-rose-500/50 rounded-2xl shadow-2xl space-y-2"
            style={{
              left: `${Math.min(textModalPos.x, 500)}px`,
              top: `${Math.min(textModalPos.y, 250)}px`,
            }}
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-rose-300">
              <span>Write a Thought Note</span>
              <button onClick={() => setTextModalPos(null)} className="text-rose-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddTextNote} className="flex space-x-2">
              <input
                type="text"
                autoFocus
                required
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                placeholder="Type note or thought..."
                className="px-3 py-1.5 rounded-xl bg-[#1B0710] border border-rose-500/30 text-white text-xs placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center space-x-1"
              >
                <Send className="w-3 h-3" />
                <span>Add</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-wine-950/80 border border-rose-500/30 rounded-2xl">
        {/* Tool Mode Buttons */}
        <div className="flex items-center space-x-2 bg-wine-900/60 p-1 rounded-xl border border-rose-500/20">
          <button
            onClick={() => setActiveTool("draw")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTool === "draw"
                ? "bg-rose-600 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Draw</span>
          </button>

          <button
            onClick={() => setActiveTool("text")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTool === "text"
                ? "bg-rose-600 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>

          <button
            onClick={() => setActiveTool("emoji")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTool === "emoji"
                ? "bg-rose-600 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>Emoji</span>
          </button>
        </div>

        {/* Color Options */}
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

        {/* Dynamic Tool Sub-controls */}
        {activeTool === "draw" && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-rose-300 font-semibold">Size:</span>
            <input
              type="range"
              min={2}
              max={18}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20 accent-rose-500 cursor-pointer"
            />
          </div>
        )}

        {activeTool === "emoji" && (
          <div className="flex items-center space-x-1 max-w-full overflow-x-auto">
            {EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => setSelectedEmoji(em)}
                className={`p-1 text-base rounded-lg transition-transform ${
                  selectedEmoji === em ? "scale-125 bg-rose-500/30 border border-rose-400" : ""
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
