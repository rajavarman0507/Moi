"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { derivePbkdf2Hash, deriveAesGcmKeyFromPin } from "@/lib/cryptoUtils";

interface ChatContextType {
  cryptoKey: CryptoKey | null;
  isUnlocked: boolean;
  unlockChat: (pin: string) => Promise<boolean>;
  lockChat: () => void;
  resetInactivityTimer: () => void;
}

const ChatContext = createContext<ChatContextType>({
  cryptoKey: null,
  isUnlocked: false,
  unlockChat: async () => false,
  lockChat: () => {},
  resetInactivityTimer: () => {},
});

export const useChat = () => useContext(ChatContext);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { couple } = useAuth();
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const coupleId = couple?.id;

  // 1. Reset 30-minute inactivity timer
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Auto-lock chat after 30 minutes (1,800,000 ms) of inactivity
    inactivityTimerRef.current = setTimeout(() => {
      console.log("Chat auto-locked after 30 minutes of inactivity.");
      setCryptoKey(null);
    }, 1800000);
  };

  // 2. Clear key on tab close or window unload
  useEffect(() => {
    const handleUnload = () => {
      setCryptoKey(null);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  // 3. User Interaction Activity Listener while unlocked
  useEffect(() => {
    if (!cryptoKey) return;

    resetInactivityTimer();

    const handleUserActivity = () => resetInactivityTimer();

    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);
    window.addEventListener("scroll", handleUserActivity);

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
    };
  }, [cryptoKey]);

  // 4. Unlock Chat Action (Derives CryptoKey ONCE and discards raw PIN)
  const unlockChat = async (pin: string): Promise<boolean> => {
    if (!coupleId) return false;

    try {
      // Single Source of Truth: Fetch salt & verifier hash from couples/{coupleId}/privateHub/pinConfig
      const pinConfigRef = doc(db, "couples", coupleId, "privateHub", "pinConfig");
      const pinConfigSnap = await getDoc(pinConfigRef);

      if (!pinConfigSnap.exists()) {
        throw new Error("PIN not configured yet.");
      }

      const { pbkdf2Hash, salt } = pinConfigSnap.data();

      // Verify PIN against PBKDF2 verifier hash
      const computedHash = await derivePbkdf2Hash(pin, salt);
      if (computedHash !== pbkdf2Hash) {
        return false;
      }

      // Pre-derive AES-GCM 256-bit CryptoKey ONCE and hold key object in memory
      const key = await deriveAesGcmKeyFromPin(pin, salt);
      setCryptoKey(key);
      resetInactivityTimer();
      return true;
    } catch (err) {
      console.error("Error unlocking chat:", err);
      return false;
    }
  };

  // 5. Lock Chat Action
  const lockChat = () => {
    setCryptoKey(null);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  };

  return (
    <ChatContext.Provider
      value={{
        cryptoKey,
        isUnlocked: !!cryptoKey,
        unlockChat,
        lockChat,
        resetInactivityTimer,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
