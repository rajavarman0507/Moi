"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  type: "heart-solid" | "heart-double" | "heart-sparkle" | "heart-soft" | "sparkle";
  opacity: number;
  gradId: string;
}

export default function SparklingHearts() {
  const { theme } = useTheme();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isLightMode, setIsLightMode] = useState<boolean>(false);

  // 1. Listen for DOM light class & theme context state updates
  useEffect(() => {
    const updateThemeState = () => {
      const isDocLight = typeof document !== "undefined" && document.documentElement.classList.contains("light");
      const isContextLight = theme === "light" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches);
      setIsLightMode(isDocLight || isContextLight);
    };

    updateThemeState();

    if (typeof document !== "undefined") {
      const observer = new MutationObserver(updateThemeState);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }
  }, [theme]);

  // 2. Generate 60 dense particles for a vibrant floating heart atmosphere
  useEffect(() => {
    const types: Particle["type"][] = [
      "heart-solid",
      "heart-double",
      "heart-sparkle",
      "heart-soft",
      "sparkle",
    ];
    const gradIds = [
      "lightGradRuby",
      "lightGradCrimson",
      "lightGradRose",
      "lightGradCoral",
      "lightGradGold",
    ];

    const items: Particle[] = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: (i * 1.65 + Math.random() * 2) % 98 + 1, // 1% to 99% evenly spread
      size: Math.random() * 28 + 16, // 16px to 44px
      duration: Math.random() * 10 + 7, // 7s to 17s float time
      delay: Math.random() * 8, // 0s to 8s stagger
      type: types[i % types.length],
      opacity: Math.random() * 0.35 + 0.65, // 0.65 to 1.0 opacity
      gradId: gradIds[i % gradIds.length],
    }));
    setParticles(items);
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden z-0 transition-colors duration-500 ${
        isLightMode
          ? "bg-gradient-to-b from-[#FFF0F5] via-[#FFE4EC] to-[#FFD8E5]"
          : "bg-gradient-to-b from-[#18070E] via-[#2A0E1A] to-[#14050B]"
      }`}
    >
      {/* SVG Defs for Dedicated Light Mode Multi-Tone Gradients */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="lightGradRuby" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF1E56" />
            <stop offset="50%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#9F1239" />
          </linearGradient>
          <linearGradient id="lightGradCrimson" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F43F5E" />
            <stop offset="100%" stopColor="#BE123C" />
          </linearGradient>
          <linearGradient id="lightGradRose" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>
          <linearGradient id="lightGradCoral" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6584" />
            <stop offset="100%" stopColor="#FF3366" />
          </linearGradient>
          <radialGradient id="lightGradGold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="60%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </radialGradient>
        </defs>
      </svg>

      {/* Radial ambient glow orbs behind main cards */}
      <div
        className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[140px] transition-all duration-500 ${
          isLightMode ? "bg-rose-300/50" : "bg-rose-900/20"
        }`}
      />
      <div
        className={`absolute bottom-10 right-10 w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-500 ${
          isLightMode ? "bg-pink-300/50" : "bg-wine-800/20"
        }`}
      />
      <div
        className={`absolute top-2/3 left-10 w-[400px] h-[400px] rounded-full blur-[110px] transition-all duration-500 ${
          isLightMode ? "bg-amber-200/40" : "bg-transparent"
        }`}
      />

      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute ${
            isLightMode ? "animate-float-heart-light" : "animate-float-heart-dark"
          }`}
          style={{
            left: `${p.x}%`,
            bottom: "-50px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ["--particle-opacity" as string]: `${p.opacity}`,
          }}
        >
          {isLightMode ? (
            /* Render Dedicated Light Mode Gradient SVG Hearts */
            p.type === "sparkle" ? (
              <svg
                width={p.size * 0.85}
                height={p.size * 0.85}
                viewBox="0 0 24 24"
                className="animate-pulse"
                style={{
                  filter: "drop-shadow(0 2px 8px rgba(217, 119, 6, 0.55))",
                }}
              >
                <path
                  fill="url(#lightGradGold)"
                  d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"
                />
              </svg>
            ) : p.type === "heart-double" ? (
              <svg
                width={p.size * 1.25}
                height={p.size * 1.25}
                viewBox="0 0 32 32"
                style={{
                  filter: "drop-shadow(0 4px 14px rgba(225, 29, 72, 0.5))",
                }}
              >
                <path
                  fill={`url(#${p.gradId})`}
                  d="M12 24.35l-1.45-1.32C5.4 18.36 2 15.28 2 11.5 2 8.42 4.42 6 7.5 6c1.74 0 3.41.81 4.5 2.09C13.09 6.81 14.76 6 16.5 6 19.58 6 22 8.42 22 11.5c0 3.78-3.4 6.86-8.55 11.54L12 24.35z"
                />
                <path
                  fill="url(#lightGradRose)"
                  transform="translate(8, -6) scale(0.65)"
                  d="M12 24.35l-1.45-1.32C5.4 18.36 2 15.28 2 11.5 2 8.42 4.42 6 7.5 6c1.74 0 3.41.81 4.5 2.09C13.09 6.81 14.76 6 16.5 6 19.58 6 22 8.42 22 11.5c0 3.78-3.4 6.86-8.55 11.54L12 24.35z"
                />
              </svg>
            ) : p.type === "heart-sparkle" ? (
              <svg
                width={p.size * 1.2}
                height={p.size * 1.2}
                viewBox="0 0 28 28"
                style={{
                  filter: "drop-shadow(0 4px 14px rgba(225, 29, 72, 0.55))",
                }}
              >
                <path
                  fill={`url(#${p.gradId})`}
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
                <path
                  fill="url(#lightGradGold)"
                  transform="translate(14, -2) scale(0.45)"
                  className="animate-pulse"
                  d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"
                />
              </svg>
            ) : p.type === "heart-soft" ? (
              <svg
                width={p.size}
                height={p.size}
                viewBox="0 0 24 24"
                style={{
                  filter: "drop-shadow(0 0 12px rgba(255, 101, 132, 0.85))",
                }}
              >
                <path
                  fill="url(#lightGradCoral)"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            ) : (
              <svg
                width={p.size}
                height={p.size}
                viewBox="0 0 24 24"
                style={{
                  filter: "drop-shadow(0 4px 12px rgba(225, 29, 72, 0.5))",
                }}
              >
                <path
                  fill={`url(#${p.gradId})`}
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            )
          ) : (
            /* Render Dark Wine Mode SVGs */
            p.type === "sparkle" ? (
              <svg
                width={p.size * 0.85}
                height={p.size * 0.85}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-amber-200/80 drop-shadow-[0_0_12px_rgba(254,240,138,0.9)] animate-pulse"
              >
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            ) : (
              <svg
                width={p.size}
                height={p.size}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-rose-500/70 drop-shadow-[0_0_10px_rgba(225,29,72,0.7)]"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            )
          )}
        </div>
      ))}
    </div>
  );
}
