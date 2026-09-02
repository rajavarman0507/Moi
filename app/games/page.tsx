"use client";

import React from "react";
import Link from "next/link";
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
} from "lucide-react";

interface GameInfo {
  title: string;
  href: string;
  description: string;
  icon: React.ElementType;
  tag: string;
}

const gamesList: GameInfo[] = [
  {
    title: "This or That",
    href: "/games/this-or-that",
    description: "Pick your preferences privately and reveal if you matched!",
    icon: HelpCircle,
    tag: "55 Prompts",
  },
  {
    title: "Truth or Dare",
    href: "/games/truth-or-dare",
    description: "Couple edition: turn-based romantic truths & fun dares.",
    icon: Flame,
    tag: "90 Cards",
  },
  {
    title: "Compatibility Quiz",
    href: "/games/compatibility-quiz",
    description: "10-question quiz revealing your shared compatibility score.",
    icon: CheckSquare,
    tag: "10 Questions",
  },
  {
    title: "Sketch & Guess",
    href: "/games/sketch-and-guess",
    description: "Draw on live canvas while your partner guesses in real time!",
    icon: Pencil,
    tag: "Realtime Canvas",
  },
  {
    title: "Casual Mini-Games",
    href: "/games/casual",
    description: "Classic Tic Tac Toe, Connect Four & Snakes & Ladders.",
    icon: Grid,
    tag: "3 Arcade Games",
  },
  {
    title: "Never Have I Ever",
    href: "/games/never-have-i-ever",
    description: "Flip cards and count your 'both raised hands' moments.",
    icon: PartyPopper,
    tag: "55 Statements",
  },
];

export default function GamesHubPage() {
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

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gamesList.map((game) => {
          const Icon = game.icon;
          return (
            <Link
              key={game.title}
              href={game.href}
              className="moi-card p-6 block hover:-translate-y-1.5 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-wine-800 flex items-center justify-center text-white shadow-glow group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-[11px] font-bold text-rose-300">
                    {game.tag}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white group-hover:text-rose-300 transition-colors">
                  {game.title}
                </h3>
                <p className="text-xs text-rose-200/60 mt-1.5 leading-relaxed">
                  {game.description}
                </p>
              </div>

              <div className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-400 mt-6 pt-3 border-t border-rose-900/40">
                <span>Play Now</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
