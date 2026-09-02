"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Heart, Copy, Check, Calendar, Key, Sparkles, ArrowRight } from "lucide-react";

export default function PairPage() {
  const router = useRouter();
  const { user, couple, loading } = useAuth();

  const [activeTab, setActiveTab] = useState<"generate" | "join">("generate");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [partnerCode, setPartnerCode] = useState<string>("");
  const [togetherSince, setTogetherSince] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  useEffect(() => {
    if (!loading && couple) {
      router.push("/");
    }
  }, [couple, loading, router]);

  useEffect(() => {
    if (user && activeTab === "generate" && !generatedCode && !isGenerating) {
      generateInviteCode();
    }
  }, [user, activeTab]);

  const generateRandomCode = (): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const generateInviteCode = async () => {
    if (!user) return;
    setIsGenerating(true);
    setError("");
    try {
      const newCode = generateRandomCode();
      await setDoc(doc(db, "invites", newCode), {
        code: newCode,
        creatorUid: user.uid,
        createdAt: serverTimestamp(),
      });
      setGeneratedCode(newCode);
    } catch (err: any) {
      console.error("Error generating invite code:", err);
      setError("Could not generate code. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePairAccounts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSuccessMsg("");

    const cleanCode = partnerCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setError("Please enter a valid 6-character invite code.");
      return;
    }

    if (!togetherSince) {
      setError("Please select the date you both got together.");
      return;
    }

    setIsLinking(true);
    try {
      const inviteRef = doc(db, "invites", cleanCode);
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        setError("Invalid code or code has expired. Please verify with your partner.");
        setIsLinking(false);
        return;
      }

      const inviteData = inviteSnap.data();
      if (inviteData.creatorUid === user.uid) {
        setError("You cannot enter your own invite code. Share it with your partner instead!");
        setIsLinking(false);
        return;
      }

      const newCoupleRef = doc(collection(db, "couples"));
      const coupleId = newCoupleRef.id;

      await setDoc(newCoupleRef, {
        id: coupleId,
        userIds: [inviteData.creatorUid, user.uid],
        togetherSince: togetherSince,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", inviteData.creatorUid), {
        coupleId: coupleId,
      });

      await updateDoc(doc(db, "users", user.uid), {
        coupleId: coupleId,
      });

      await deleteDoc(inviteRef);

      setSuccessMsg("Successfully paired! Directing to your home...");
      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err: any) {
      console.error("Pairing error:", err);
      setError(err.message || "Failed to pair accounts. Please try again.");
    } finally {
      setIsLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-rose-300 relative z-10">
        <p className="font-medium animate-pulse">Loading pairing space...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-lg moi-card p-8 md:p-10 space-y-8 relative overflow-hidden">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-rose-600 via-wine-600 to-rose-400 flex items-center justify-center text-white mx-auto shadow-glow">
            <Heart className="w-7 h-7 fill-white text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>Connect With Your Partner</span>
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </h1>
            <p className="text-sm text-rose-200/70 mt-1">
              Moi is built strictly for two. Pair your accounts to begin.
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-wine-950/80 p-1.5 rounded-2xl border border-rose-500/20">
          <button
            type="button"
            onClick={() => setActiveTab("generate")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              activeTab === "generate"
                ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            My Invite Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("join")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              activeTab === "join"
                ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
                : "text-rose-300/70 hover:text-white"
            }`}
          >
            Enter Partner Code
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-300 font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-300 font-medium">
            {successMsg}
          </div>
        )}

        {/* TAB 1: Display Invite Code */}
        {activeTab === "generate" && (
          <div className="space-y-6 text-center">
            <p className="text-xs text-rose-200/70">
              Share this code with your partner. Once they enter it, your accounts will instantly link!
            </p>

            <div className="bg-wine-950/60 border border-rose-500/30 p-6 rounded-3xl space-y-4 relative shadow-glow">
              <span className="text-xs uppercase font-semibold text-rose-400 tracking-wider block">
                Your 6-Character Code
              </span>
              <div className="text-4xl md:text-5xl font-mono font-extrabold text-amber-200 tracking-widest drop-shadow-[0_0_12px_rgba(254,240,138,0.5)]">
                {isGenerating ? "..." : generatedCode || "------"}
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                disabled={!generatedCode}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl moi-button-secondary text-xs font-semibold shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-rose-300" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center space-x-2 text-xs text-rose-300/60 animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Waiting for partner to enter code...</span>
            </div>
          </div>
        )}

        {/* TAB 2: Enter Partner's Code */}
        {activeTab === "join" && (
          <form onSubmit={handlePairAccounts} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-rose-300/80 mb-1.5">
                Partner's Invite Code
              </label>
              <div className="relative">
                <Key className="w-5 h-5 absolute left-3.5 top-3.5 text-rose-400/60" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={partnerCode}
                  onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A8X9K2"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-wine-950/60 border border-rose-500/20 text-amber-200 placeholder-rose-300/30 focus:border-rose-400 focus:outline-none text-sm font-mono tracking-widest uppercase transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-rose-300/80 mb-1.5">
                Together Since
              </label>
              <div className="relative">
                <Calendar className="w-5 h-5 absolute left-3.5 top-3.5 text-rose-400/60" />
                <input
                  type="date"
                  required
                  value={togetherSince}
                  onChange={(e) => setTogetherSince(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-wine-950/60 border border-rose-500/20 text-white placeholder-rose-300/30 focus:border-rose-400 focus:outline-none text-sm transition-all"
                />
              </div>
              <p className="text-[11px] text-rose-300/60 mt-1">
                The date you officially started your journey together.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLinking}
              className="w-full moi-button-primary flex items-center justify-center space-x-2 py-3.5 font-semibold text-sm disabled:opacity-50"
            >
              <span>{isLinking ? "Linking Accounts..." : "Complete Pairing"}</span>
              {!isLinking && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
