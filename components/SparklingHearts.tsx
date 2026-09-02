"use client";

import React, { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  type: "heart" | "sparkle";
  opacity: number;
}

export default function SparklingHearts() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate 35 floating hearts and sparkles
    const items: Particle[] = Array.from({ length: 35 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage x-position
      size: Math.random() * 20 + 10, // size 10px to 30px
      duration: Math.random() * 12 + 8, // duration 8s to 20s
      delay: Math.random() * 10, // stagger start times up to 10s
      type: i % 3 === 0 ? "sparkle" : "heart",
      opacity: Math.random() * 0.5 + 0.3,
    }));
    setParticles(items);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-gradient-to-b from-[#18070E] via-[#2A0E1A] to-[#14050B]">
      {/* Radial spotlight glow behind central cards */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-900/20 rounded-full blur-[140px]" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-wine-800/20 rounded-full blur-[120px]" />

      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-float-up"
          style={{
            left: `${p.x}%`,
            bottom: "-40px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationIterationCount: "infinite",
            animationTimingFunction: "linear",
            opacity: p.opacity,
          }}
        >
          {p.type === "heart" ? (
            <svg
              width={p.size}
              height={p.size}
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-rose-500/60 drop-shadow-[0_0_8px_rgba(225,29,72,0.6)]"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg
              width={p.size * 0.8}
              height={p.size * 0.8}
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-amber-200/70 drop-shadow-[0_0_10px_rgba(254,240,138,0.8)] animate-pulse"
            >
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
