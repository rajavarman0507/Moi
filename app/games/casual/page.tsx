"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import {
  TicTacToeState,
  ConnectFourState,
  SnakesLaddersState,
} from "@/lib/gameSchemas";
import WaitingForPartner from "@/components/WaitingForPartner";
import { Grid, Heart, Sparkles, RefreshCw, ArrowLeft, Dices } from "lucide-react";
import Link from "next/link";

type SubGame = "tictactoe" | "connectfour" | "snakesladders";

const SNAKES_LADDERS_MAP: Record<number, number> = {
  // Ladders (Climb up)
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
  // Snakes (Slide down)
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};

export default function CasualGamesPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<SubGame>("tictactoe");

  const [tttState, setTttState] = useState<TicTacToeState | null>(null);
  const [c4State, setC4State] = useState<ConnectFourState | null>(null);
  const [snakesState, setSnakesState] = useState<SnakesLaddersState | null>(null);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";
  const partnerUid = couple?.userIds.find((id) => id !== user?.uid);

  // Deterministic Player 1 & Player 2 sorting across both clients
  const sortedUids = couple?.userIds ? [...couple.userIds].sort() : [];
  const player1Uid = sortedUids[0] || user?.uid || "";
  const player2Uid = sortedUids[1] || partnerUid || "";

  const player1Name = user?.uid === player1Uid ? myName : partnerName;
  const player2Name = user?.uid === player2Uid ? myName : partnerName;

  // Subscribe to Tic Tac Toe State with Auto-Healing
  useEffect(() => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "ticTacToe");
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as TicTacToeState;
          if (data.currentTurnUid !== player1Uid && data.currentTurnUid !== player2Uid) {
            data.currentTurnUid = player1Uid;
            setDoc(ref, { ...data, currentTurnUid: player1Uid, updatedAt: serverTimestamp() }).catch(() => {});
          }
          setTttState(data);
        } else {
          const init: TicTacToeState = {
            board: Array(9).fill(null),
            currentTurnUid: player1Uid,
            winner: null,
            scores: { [player1Uid]: 0, [player2Uid]: 0 },
          };
          setDoc(ref, { ...init, updatedAt: serverTimestamp() }).catch((err) => console.error(err));
          setTttState(init);
        }
      },
      (err) => console.error("TicTacToe onSnapshot error:", err)
    );
  }, [couple, user, player1Uid, player2Uid]);

  // Subscribe to Connect Four State with Auto-Healing
  useEffect(() => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "connectFour");
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ConnectFourState;
          if (data.currentTurnUid !== player1Uid && data.currentTurnUid !== player2Uid) {
            data.currentTurnUid = player1Uid;
            setDoc(ref, { ...data, currentTurnUid: player1Uid, updatedAt: serverTimestamp() }).catch(() => {});
          }
          setC4State(data);
        } else {
          const emptyGrid = Array.from({ length: 6 }, () => Array(7).fill(null));
          const init: ConnectFourState = {
            grid: emptyGrid,
            currentTurnUid: player1Uid,
            winner: null,
            scores: { [player1Uid]: 0, [player2Uid]: 0 },
          };
          setDoc(ref, { ...init, updatedAt: serverTimestamp() }).catch((err) => console.error(err));
          setC4State(init);
        }
      },
      (err) => console.error("ConnectFour onSnapshot error:", err)
    );
  }, [couple, user, player1Uid, player2Uid]);

  // Subscribe to Snakes & Ladders State with Auto-Healing
  useEffect(() => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "snakesLadders");
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SnakesLaddersState;
          if (data.currentTurnUid !== player1Uid && data.currentTurnUid !== player2Uid) {
            data.currentTurnUid = player1Uid;
            setDoc(ref, { ...data, currentTurnUid: player1Uid, updatedAt: serverTimestamp() }).catch(() => {});
          }
          setSnakesState(data);
        } else {
          const init: SnakesLaddersState = {
            positions: { [player1Uid]: 1, [player2Uid]: 1 },
            currentTurnUid: player1Uid,
            lastDiceRoll: null,
            winner: null,
          };
          setDoc(ref, { ...init, updatedAt: serverTimestamp() }).catch((err) => console.error(err));
          setSnakesState(init);
        }
      },
      (err) => console.error("SnakesLadders onSnapshot error:", err)
    );
  }, [couple, user, player1Uid, player2Uid]);

  // --- TIC TAC TOE LOGIC ---
  const handleTttCellClick = async (cellIdx: number) => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid || !tttState || tttState.winner || tttState.board[cellIdx]) return;
    if (tttState.currentTurnUid !== user.uid) return;

    const newBoard = [...tttState.board];
    newBoard[cellIdx] = user.uid;

    const winner = checkTttWinner(newBoard, player1Uid, player2Uid);
    const nextTurn = winner ? tttState.currentTurnUid : (user.uid === player1Uid ? player2Uid : player1Uid);

    const newScores = { ...(tttState.scores || {}) };
    if (winner && winner !== "draw") {
      newScores[winner] = (newScores[winner] || 0) + 1;
    }

    const ref = doc(db, "couples", couple.id, "games", "ticTacToe");
    await setDoc(ref, {
      board: newBoard,
      currentTurnUid: nextTurn,
      winner: winner,
      scores: newScores,
      updatedAt: serverTimestamp(),
    });
  };

  const checkTttWinner = (board: (string | null)[], p1Uid: string, p2Uid: string): string | null => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    if (board.every((cell) => cell !== null)) return "draw";
    return null;
  };

  const handleResetTtt = async () => {
    if (!couple?.id || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "ticTacToe");
    await setDoc(ref, {
      board: Array(9).fill(null),
      currentTurnUid: player1Uid,
      winner: null,
      scores: tttState?.scores || { [player1Uid]: 0, [player2Uid]: 0 },
      updatedAt: serverTimestamp(),
    });
  };

  // --- CONNECT FOUR LOGIC ---
  const handleC4ColumnClick = async (colIdx: number) => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid || !c4State || c4State.winner) return;
    if (c4State.currentTurnUid !== user.uid) return;

    // Ensure grid is valid 6x7 matrix
    const currentGrid = (c4State.grid && c4State.grid.length === 6)
      ? c4State.grid
      : Array.from({ length: 6 }, () => Array(7).fill(null));

    // Find lowest empty row in column (from bottom row 5 up to top row 0)
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (!currentGrid[r] || currentGrid[r][colIdx] === null || currentGrid[r][colIdx] === undefined) {
        targetRow = r;
        break;
      }
    }
    if (targetRow === -1) return; // Column full

    const newGrid = currentGrid.map((row) => [...(row || Array(7).fill(null))]);
    newGrid[targetRow][colIdx] = user.uid;

    const winner = checkC4Winner(newGrid, user.uid);
    const nextTurn = winner ? c4State.currentTurnUid : (user.uid === player1Uid ? player2Uid : player1Uid);

    const newScores = { ...(c4State.scores || {}) };
    if (winner && winner !== "draw") {
      newScores[winner] = (newScores[winner] || 0) + 1;
    }

    const ref = doc(db, "couples", couple.id, "games", "connectFour");
    await setDoc(ref, {
      grid: newGrid,
      currentTurnUid: nextTurn,
      winner: winner,
      scores: newScores,
      updatedAt: serverTimestamp(),
    });
  };

  const checkC4Winner = (grid: (string | null)[][], uid: string): string | null => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const val = grid[r]?.[c];
        if (!val) continue;
        if (c + 3 < 7 && val === grid[r]?.[c+1] && val === grid[r]?.[c+2] && val === grid[r]?.[c+3]) return val;
        if (r + 3 < 6 && val === grid[r+1]?.[c] && val === grid[r+2]?.[c] && val === grid[r+3]?.[c]) return val;
        if (r + 3 < 6 && c + 3 < 7 && val === grid[r+1]?.[c+1] && val === grid[r+2]?.[c+2] && val === grid[r+3]?.[c+3]) return val;
        if (r - 3 >= 0 && c + 3 < 7 && val === grid[r-1]?.[c+1] && val === grid[r-2]?.[c+2] && val === grid[r-3]?.[c+3]) return val;
      }
    }
    return null;
  };

  const handleResetC4 = async () => {
    if (!couple?.id || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "connectFour");
    await setDoc(ref, {
      grid: Array.from({ length: 6 }, () => Array(7).fill(null)),
      currentTurnUid: player1Uid,
      winner: null,
      scores: c4State?.scores || { [player1Uid]: 0, [player2Uid]: 0 },
      updatedAt: serverTimestamp(),
    });
  };

  // --- SNAKES & LADDERS LOGIC ---
  const handleRollDice = async () => {
    if (!couple?.id || !user?.uid || !player1Uid || !player2Uid || !snakesState || snakesState.winner) return;
    if (snakesState.currentTurnUid !== user.uid) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    let newPos = (snakesState.positions[user.uid] || 1) + roll;

    if (newPos > 100) newPos = snakesState.positions[user.uid]; // Must land exactly on 100
    if (SNAKES_LADDERS_MAP[newPos]) {
      newPos = SNAKES_LADDERS_MAP[newPos]; // Snake or ladder jump!
    }

    const winner = newPos === 100 ? user.uid : null;
    const nextTurn = winner ? snakesState.currentTurnUid : (user.uid === player1Uid ? player2Uid : player1Uid);

    const ref = doc(db, "couples", couple.id, "games", "snakesLadders");
    await setDoc(ref, {
      positions: { ...snakesState.positions, [user.uid]: newPos },
      currentTurnUid: nextTurn,
      lastDiceRoll: roll,
      winner,
      updatedAt: serverTimestamp(),
    });
  };

  const handleResetSnakes = async () => {
    if (!couple?.id || !player1Uid || !player2Uid) return;
    const ref = doc(db, "couples", couple.id, "games", "snakesLadders");
    await setDoc(ref, {
      positions: { [player1Uid]: 1, [player2Uid]: 1 },
      currentTurnUid: player1Uid,
      lastDiceRoll: null,
      winner: null,
      updatedAt: serverTimestamp(),
    });
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Arcade Games...</p>
      </div>
    );
  }

  // Turn status indicators
  const isMyTttTurn = tttState?.currentTurnUid === user.uid;
  const tttTurnName = tttState?.currentTurnUid === player1Uid ? player1Name : player2Name;

  const isMyC4Turn = c4State?.currentTurnUid === user.uid;
  const c4TurnName = c4State?.currentTurnUid === player1Uid ? player1Name : player2Name;

  const isMySnakesTurn = snakesState?.currentTurnUid === user.uid;
  const snakesTurnName = snakesState?.currentTurnUid === player1Uid ? player1Name : player2Name;

  return (
    <WaitingForPartner>
      <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Link
            href="/games"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-rose-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Games</span>
          </Link>

          <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-bold text-rose-200">
            Arcade Hub
          </div>
        </div>

        {/* Sub-Game Selector Tabs */}
        <div className="flex bg-wine-950/80 p-1.5 rounded-2xl border border-rose-500/20">
          <button
            onClick={() => setActiveTab("tictactoe")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "tictactoe"
                ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            Tic Tac Toe
          </button>
          <button
            onClick={() => setActiveTab("connectfour")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "connectfour"
                ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            Connect Four
          </button>
          <button
            onClick={() => setActiveTab("snakesladders")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "snakesladders"
                ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            Snakes & Ladders
          </button>
        </div>

        {/* 1. TIC TAC TOE */}
        {activeTab === "tictactoe" && (
          <div className="moi-card p-8 text-center space-y-6 max-w-lg mx-auto bg-wine-950/90 border border-rose-500/30 shadow-2xl">
            <div className="flex items-center justify-between text-xs font-bold text-rose-300 border-b border-rose-900/40 pb-3">
              <span>{player1Name} (♥): {tttState?.scores?.[player1Uid] || 0}</span>
              
              <div className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center space-x-1.5 ${
                isMyTttTurn
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-glow animate-pulse"
                  : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
              }`}>
                <span>{isMyTttTurn ? "Your Turn! 🎯" : `${tttTurnName}'s Turn`}</span>
              </div>

              <span>{player2Name} (★): {tttState?.scores?.[player2Uid] || 0}</span>
            </div>

            {tttState?.winner ? (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm space-y-2">
                <p>{tttState.winner === "draw" ? "It's a Draw!" : `${tttState.winner === player1Uid ? player1Name : player2Name} Wins! 🎉`}</p>
                <button onClick={handleResetTtt} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-glow">Play Again</button>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3 w-64 h-64 mx-auto">
              {tttState?.board.map((cell, idx) => {
                const isP1 = cell === player1Uid;
                const isP2 = cell === player2Uid;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTttCellClick(idx)}
                    disabled={!isMyTttTurn || Boolean(cell) || Boolean(tttState?.winner)}
                    className={`w-full h-full border rounded-2xl flex items-center justify-center text-3xl font-bold transition-all ${
                      isP1
                        ? "bg-rose-600/80 border-rose-400 text-white shadow-glow"
                        : isP2
                        ? "bg-amber-500/80 border-amber-300 text-black shadow-glow"
                        : isMyTttTurn
                        ? "bg-wine-900/60 border-rose-500/30 hover:bg-rose-950/80 cursor-pointer"
                        : "bg-wine-950/60 border-rose-900/20 opacity-70 cursor-not-allowed"
                    }`}
                  >
                    {isP1 ? "♥" : isP2 ? "★" : ""}
                  </button>
                );
              })}
            </div>

            <button onClick={handleResetTtt} className="text-xs text-rose-400 underline font-semibold hover:text-white transition-colors">Reset Game</button>
          </div>
        )}

        {/* 2. CONNECT FOUR */}
        {activeTab === "connectfour" && (
          <div className="moi-card p-8 text-center space-y-6 max-w-xl mx-auto bg-wine-950/90 border border-rose-500/30 shadow-2xl">
            <div className="flex items-center justify-between text-xs font-bold text-rose-300 border-b border-rose-900/40 pb-3">
              <span className="flex items-center space-x-1">
                <span>{player1Name}</span>
                <span className="text-rose-400 font-extrabold">(🔴):</span>
                <span>{c4State?.scores?.[player1Uid] || 0}</span>
              </span>

              <div className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center space-x-1.5 ${
                isMyC4Turn
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-glow animate-pulse"
                  : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
              }`}>
                <span>{isMyC4Turn ? "Your Turn! 🎯" : `${c4TurnName}'s Turn`}</span>
              </div>

              <span className="flex items-center space-x-1">
                <span>{player2Name}</span>
                <span className="text-amber-300 font-extrabold">(🟡):</span>
                <span>{c4State?.scores?.[player2Uid] || 0}</span>
              </span>
            </div>

            {c4State?.winner && (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm space-y-2">
                <p>{`${c4State.winner === player1Uid ? player1Name : player2Name} Wins Connect Four! 🎉`}</p>
                <button onClick={handleResetC4} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-glow">Play Again</button>
              </div>
            )}

            <div className="grid grid-cols-7 gap-2 p-4 bg-wine-900/80 rounded-3xl border border-rose-500/30">
              {Array.from({ length: 7 }).map((_, colIdx) => (
                <button
                  key={colIdx}
                  type="button"
                  onClick={() => handleC4ColumnClick(colIdx)}
                  disabled={!isMyC4Turn || Boolean(c4State?.winner)}
                  className={`flex flex-col space-y-2 p-1.5 rounded-2xl transition-all ${
                    isMyC4Turn && !c4State?.winner
                      ? "hover:bg-rose-500/20 cursor-pointer"
                      : "cursor-not-allowed opacity-90"
                  }`}
                >
                  {Array.from({ length: 6 }).map((_, rowIdx) => {
                    const cellOwner = c4State?.grid?.[rowIdx]?.[colIdx];
                    const isP1 = cellOwner === player1Uid;
                    const isP2 = cellOwner === player2Uid;

                    return (
                      <div
                        key={rowIdx}
                        className={`w-9 h-9 md:w-11 md:h-11 rounded-full border border-rose-950 flex items-center justify-center text-base transition-all ${
                          isP1
                            ? "bg-rose-500 shadow-glow text-white font-extrabold"
                            : isP2
                            ? "bg-amber-400 shadow-glow text-black font-extrabold"
                            : "bg-wine-950/80 pointer-events-none"
                        }`}
                      >
                        {isP1 ? "🔴" : isP2 ? "🟡" : ""}
                      </div>
                    );
                  })}
                </button>
              ))}
            </div>

            <button onClick={handleResetC4} className="text-xs text-rose-400 underline font-semibold hover:text-white transition-colors">Reset Board</button>
          </div>
        )}

        {/* 3. SNAKES & LADDERS */}
        {activeTab === "snakesladders" && (
          <div className="moi-card p-8 text-center space-y-6 bg-wine-950/90 border border-rose-500/30 shadow-2xl">
            <div className="flex items-center justify-between text-xs font-bold text-rose-300 border-b border-rose-900/40 pb-3">
              <span>{player1Name} (🔴) Pos: {snakesState?.positions?.[player1Uid] || 1}</span>

              <div className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center space-x-1.5 ${
                isMySnakesTurn
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-glow animate-pulse"
                  : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
              }`}>
                <span>{isMySnakesTurn ? "Your Turn! 🎯" : `${snakesTurnName}'s Turn`}</span>
              </div>

              <span>{player2Name} (🟡) Pos: {snakesState?.positions?.[player2Uid] || 1}</span>
            </div>

            {snakesState?.winner && (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm space-y-2">
                <p>{`${snakesState.winner === player1Uid ? player1Name : player2Name} Reached 100 First & Wins! 🎉`}</p>
                <button onClick={handleResetSnakes} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-glow">Play Again</button>
              </div>
            )}

            {/* Roll Control */}
            <div className="flex flex-col items-center space-y-3">
              {snakesState?.lastDiceRoll && (
                <div className="text-sm font-bold text-amber-300">
                  Last Dice Roll: 🎲 <span className="text-xl">{snakesState.lastDiceRoll}</span>
                </div>
              )}

              <button
                onClick={handleRollDice}
                disabled={!isMySnakesTurn || Boolean(snakesState?.winner)}
                className="moi-button-primary inline-flex items-center space-x-2 py-3 px-6 text-xs font-bold disabled:opacity-50"
              >
                <Dices className="w-4 h-4" />
                <span>{isMySnakesTurn ? "Roll Dice 🎲" : `Waiting for ${snakesTurnName}...`}</span>
              </button>
            </div>

            {/* 100 Cell Grid Preview */}
            <div className="grid grid-cols-10 gap-1 p-3 bg-wine-900/60 rounded-2xl border border-rose-500/20 text-[10px] font-mono">
              {Array.from({ length: 100 }).map((_, idx) => {
                const cellNum = 100 - idx;
                const isP1Pos = snakesState?.positions?.[player1Uid] === cellNum;
                const isP2Pos = snakesState?.positions?.[player2Uid] === cellNum;
                const isSnakeOrLadder = SNAKES_LADDERS_MAP[cellNum];

                return (
                  <div
                    key={cellNum}
                    className={`h-8 rounded flex items-center justify-center relative font-bold ${
                      isP1Pos && isP2Pos
                        ? "bg-amber-400 text-black shadow-glow"
                        : isP1Pos
                        ? "bg-rose-500 text-white shadow-glow"
                        : isP2Pos
                        ? "bg-amber-300 text-black shadow-glow"
                        : isSnakeOrLadder
                        ? "bg-wine-800 text-amber-200"
                        : "bg-wine-950/60 text-rose-300/60"
                    }`}
                  >
                    <span>{cellNum}</span>
                    {isP1Pos && <span className="absolute -top-1 left-0 text-[9px]">🔴</span>}
                    {isP2Pos && <span className="absolute -top-1 right-0 text-[9px]">🟡</span>}
                  </div>
                );
              })}
            </div>

            <button onClick={handleResetSnakes} className="text-xs text-rose-400 underline font-semibold hover:text-white transition-colors">Reset Game</button>
          </div>
        )}
      </div>
    </WaitingForPartner>
  );
}
