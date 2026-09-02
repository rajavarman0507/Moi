"use client";

import React from "react";
import Link from "next/link";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Flame,
  CheckSquare,
  Pencil,
  Grid,
  PartyPopper,
  Heart,
} from "lucide-react";

interface GameInfo {
  id: string;
  title: string;
  href: string;
  description: string;
  icon: React.ElementType;
  tag: string;
}

const gamesList: GameInfo[] = [
  {
    id: "this-or-that",
    title: "This or That",
    href: "/games/this-or-that",
    description: "Pick your preferences privately and reveal if you matched!",
    icon: HelpCircle,
    tag: "55 Prompts",
  },
  {
    id: "truth-or-dare",
    title: "Truth or Dare",
    href: "/games/truth-or-dare",
    description: "Couple edition: turn-based romantic truths & fun dares.",
    icon: Flame,
    tag: "90 Cards",
  },
  {
    id: "compatibility-quiz",
    title: "Compatibility Quiz",
    href: "/games/compatibility-quiz",
    description: "10-question quiz revealing your shared compatibility score.",
    icon: CheckSquare,
    tag: "10 Questions",
  },
  {
    id: "sketch-and-guess",
    title: "Sketch & Guess",
    href: "/games/sketch-and-guess",
    description: "Draw on live canvas while your partner guesses in real time!",
    icon: Pencil,
    tag: "Realtime Canvas",
  },
  {
    id: "casual",
    title: "Casual Mini-Games",
    href: "/games/casual",
    description: "Classic Tic Tac Toe, Connect Four & Snakes & Ladders.",
    icon: Grid,
    tag: "3 Arcade Games",
  },
  {
    id: "never-have-i-ever",
    title: "Never Have I Ever",
    href: "/games/never-have-i-ever",
    description: "Flip cards and count your 'both raised hands' moments.",
    icon: PartyPopper,
    tag: "55 Statements",
  },
];

export default function GamesHubPage() {
  const { online: partnerOnline, currentPath, partnerName } = usePartnerPresence();

  return (
    <div className="space-y-8 relative z-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Couple Games Hub</span>
            <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            Real-time multiplayer games designed strictly for two.
          </p>
        </div>

        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-glow self-start md:self-auto">
          <Gamepad2 className="w-4 h-4 text-rose-400" />
          <span>6 Interactive Games</span>
        </div>
      </div>

      {/* Partner Live Activity Banner */}
      {partnerOnline && currentPath.startsWith("/games/") && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 flex items-center space-x-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          <p className="text-xs font-extrabold text-emerald-200 flex items-center gap-2">
            <span>💚 {partnerName} is currently playing a game right now!</span>
          </p>
        </div>
      )}

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gamesList.map((game) => {
          const Icon = game.icon;
          const isPartnerHere = partnerOnline && currentPath === game.href;

          return (
            <Link
              key={game.title}
              href={game.href}
              className={`moi-card p-6 block transition-all group flex flex-col justify-between relative overflow-hidden ${
                isPartnerHere
                  ? "border-2 border-emerald-400 bg-gradient-to-br from-[#122A1E]/95 via-[#193F2B]/95 to-[#0A1D13]/95 shadow-[0_0_25px_rgba(16,185,129,0.5)] scale-[1.02]"
                  : "hover:-translate-y-1.5"
              }`}
            >
              {/* Partner Active Blinking Green Heart Badge */}
              {isPartnerHere && (
                <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-[11px] font-extrabold text-emerald-300 flex items-center space-x-1.5 animate-bounce shadow-glow">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{partnerName} is here! 💚</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-glow group-hover:scale-110 transition-transform ${
                      isPartnerHere
                        ? "bg-gradient-to-br from-emerald-500 to-teal-700"
                        : "bg-gradient-to-br from-rose-600 to-wine-800"
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  {!isPartnerHere && (
                    <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-[11px] font-bold text-rose-300">
                      {game.tag}
                    </span>
                  )}
                </div>

                <h3
                  className={`text-lg font-bold transition-colors ${
                    isPartnerHere ? "text-emerald-200" : "text-white group-hover:text-rose-300"
                  }`}
                >
                  {game.title}
                </h3>
                <p className="text-xs text-rose-200/60 mt-1.5 leading-relaxed">
                  {game.description}
                </p>
              </div>

              <div
                className={`inline-flex items-center space-x-1 text-xs font-semibold mt-6 pt-3 border-t ${
                  isPartnerHere
                    ? "text-emerald-300 border-emerald-900/50"
                    : "text-rose-400 border-rose-900/40"
                }`}
              >
                <span>{isPartnerHere ? "Join Partner Now" : "Play Now"}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
