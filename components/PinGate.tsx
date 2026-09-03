"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { derivePbkdf2Hash, generateSaltHex } from "@/lib/cryptoUtils";
import { Lock, KeyRound, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";

interface PinGateProps {
  onUnlock: (pin: string, saltHex: string) => void;
}

interface PinConfig {
  pbkdf2Hash: string;
  salt: string;
  createdBy: string;
}

export default function PinGate({ onUnlock }: PinGateProps) {
  const { user, couple } = useAuth();
  const [pinConfig, setPinConfig] = useState<PinConfig | null>(null);
  const [isConfigLoaded, setIsConfigLoaded] = useState<boolean>(false);

  const [pinInput, setPinInput] = useState<string>("");
  const [confirmPinInput, setConfirmPinInput] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const coupleId = couple?.id;

  // Check if Shared Couple PIN is already configured
  useEffect(() => {
    if (!coupleId) return;

    const pinConfigRef = doc(db, "couples", coupleId, "privateHub", "pinConfig");
    getDoc(pinConfigRef).then((snap) => {
      if (snap.exists()) {
        setPinConfig(snap.data() as PinConfig);
      } else {
        setPinConfig(null);
      }
      setIsConfigLoaded(true);
    });
  }, [coupleId]);

  // Handle First-Time Shared PIN Setup
  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !user?.uid) return;

    if (pinInput.length < 4 || pinInput.length > 6 || !/^\d+$/.test(pinInput)) {
      setError("PIN must be 4 to 6 numeric digits.");
      return;
    }

    if (pinInput !== confirmPinInput) {
      setError("PINs do not match. Please try again.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const salt = generateSaltHex();
      const hash = await derivePbkdf2Hash(pinInput, salt);

      const pinConfigRef = doc(db, "couples", coupleId, "privateHub", "pinConfig");
      const configData: PinConfig = {
        pbkdf2Hash: hash,
        salt,
        createdBy: user.uid,
      };

      await setDoc(pinConfigRef, {
        ...configData,
        createdAt: serverTimestamp(),
      });

      setPinConfig(configData);
      onUnlock(pinInput, salt);
    } catch (err) {
      console.error("PIN setup error:", err);
      setError("Failed to configure PIN. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Subsequent PIN Verification
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinConfig || !pinInput) return;

    if (!/^\d+$/.test(pinInput)) {
      setError("Please enter a valid numeric PIN.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const computedHash = await derivePbkdf2Hash(pinInput, pinConfig.salt);

      if (computedHash === pinConfig.pbkdf2Hash) {
        onUnlock(pinInput, pinConfig.salt);
      } else {
        setError("Incorrect PIN. Please try again.");
      }
    } catch (err) {
      console.error("PIN verification error:", err);
      setError("An error occurred during verification.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isConfigLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-rose-300">
        <Lock className="w-8 h-8 animate-pulse text-rose-400" />
        <p className="text-xs font-semibold mt-3 animate-pulse">Checking Private Hub Vault Security...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-gradient-to-br from-[#290B1B]/95 via-[#3D1127]/95 to-[#1E0613]/95 border border-rose-500/40 text-center space-y-6 shadow-2xl relative overflow-hidden">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-600 to-wine-700 mx-auto flex items-center justify-center text-white shadow-glow">
        <Lock className="w-8 h-8" />
      </div>

      {!pinConfig ? (
        /* FIRST-TIME SETUP */
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-white">Set Your Shared Couple PIN</h2>
            <p className="text-xs text-rose-200/70">
              Create a 4–6 digit PIN to protect your Private Hub & encrypt your love letters.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs text-left space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Important Security Notice:</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              There is no way to recover this PIN if lost — write it somewhere safe! Both of you will use this PIN to decrypt your letters.
            </p>
          </div>

          <form onSubmit={handleSetupPin} className="space-y-4 pt-2">
            <div>
              <input
                type="password"
                required
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Create 4–6 digit PIN"
                className="w-full text-center tracking-widest text-lg py-3 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>

            <div>
              <input
                type="password"
                required
                maxLength={6}
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value)}
                placeholder="Confirm PIN"
                className="w-full text-center tracking-widest text-lg py-3 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>

            {error && <p className="text-xs font-bold text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={isVerifying}
              className="moi-button-primary w-full py-3.5 text-xs font-extrabold flex items-center justify-center space-x-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isVerifying ? "Encrypting Vault..." : "Save PIN & Unlock Vault"}</span>
            </button>
          </form>
        </div>
      ) : (
        /* SUBSEQUENT UNLOCK VERIFICATION */
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-white">Unlock Private Hub</h2>
            <p className="text-xs text-rose-200/70">
              Enter your shared couple PIN to decrypt your letters and view memories.
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4 pt-2">
            <div>
              <input
                type="password"
                autoFocus
                required
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter 4–6 digit PIN"
                className="w-full text-center tracking-widest text-xl font-bold py-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/40 text-white placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none shadow-inner"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>

            {error && <p className="text-xs font-bold text-rose-400 animate-shake">{error}</p>}

            <button
              type="submit"
              disabled={isVerifying}
              className="moi-button-primary w-full py-3.5 text-xs font-extrabold flex items-center justify-center space-x-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isVerifying ? "Decrypting..." : "Unlock Vault"}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
