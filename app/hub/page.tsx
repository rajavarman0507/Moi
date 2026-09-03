"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { encryptLetter, decryptLetter } from "@/lib/cryptoUtils";
import PinGate from "@/components/PinGate";
import {
  Lock,
  Heart,
  Calendar,
  Sparkles,
  Plus,
  Send,
  ShieldCheck,
  Image as ImageIcon,
  KeyRound,
  FileText,
  Clock,
} from "lucide-react";

interface LetterDoc {
  id: string;
  cipherText: string;
  ivHex: string;
  authorUid: string;
  authorName: string;
  dateStr: string;
  createdAt?: any;
}

interface DecryptedLetter {
  id: string;
  plainText: string;
  authorName: string;
  dateStr: string;
}

interface MemoryDoc {
  id: string;
  title: string;
  date: string;
  note: string;
  photoUrl?: string;
  authorName: string;
  createdAt?: any;
}

export default function PrivateHubPage() {
  const { user, couple, userProfile, partnerProfile, loading } = useAuth();

  // Vault Unlock State
  const [unlockedPin, setUnlockedPin] = useState<string | null>(null);
  const [unlockedSalt, setUnlockedSalt] = useState<string | null>(null);

  // Active Hub Tab: "letters" | "memories"
  const [activeTab, setActiveTab] = useState<"letters" | "memories">("letters");

  // Letters state
  const [rawLetters, setRawLetters] = useState<LetterDoc[]>([]);
  const [decryptedLetters, setDecryptedLetters] = useState<DecryptedLetter[]>([]);
  const [newLetterText, setNewLetterText] = useState<string>("");
  const [isEncrypting, setIsEncrypting] = useState<boolean>(false);

  // Memories state
  const [memories, setMemories] = useState<MemoryDoc[]>([]);
  const [newMemTitle, setNewMemTitle] = useState<string>("");
  const [newMemDate, setNewMemDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [newMemNote, setNewMemNote] = useState<string>("");
  const [newMemPhoto, setNewMemPhoto] = useState<File | null>(null);
  const [isSavingMem, setIsSavingMem] = useState<boolean>(false);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  const coupleId = couple?.id;

  // 1. Subscribe to raw encrypted letters from Firestore
  useEffect(() => {
    if (!coupleId || !unlockedPin) return;

    const lettersCollRef = collection(db, "couples", coupleId, "privateHub", "letters", "items");
    const unsubscribe = onSnapshot(lettersCollRef, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LetterDoc[];
      setRawLetters(docs);
    });

    return () => unsubscribe();
  }, [coupleId, unlockedPin]);

  // 2. Decrypt letters in-memory when rawLetters or PIN changes
  useEffect(() => {
    if (!unlockedPin || !unlockedSalt || rawLetters.length === 0) {
      setDecryptedLetters([]);
      return;
    }

    const decryptAll = async () => {
      const decryptedList: DecryptedLetter[] = [];
      for (const letter of rawLetters) {
        try {
          const text = await decryptLetter(letter.cipherText, letter.ivHex, unlockedPin, unlockedSalt);
          decryptedList.push({
            id: letter.id,
            plainText: text,
            authorName: letter.authorName,
            dateStr: letter.dateStr,
          });
        } catch (err) {
          console.error("Failed to decrypt letter:", err);
          decryptedList.push({
            id: letter.id,
            plainText: "[Decryption Error — Invalid Key]",
            authorName: letter.authorName,
            dateStr: letter.dateStr,
          });
        }
      }
      setDecryptedLetters(decryptedList);
    };

    decryptAll();
  }, [rawLetters, unlockedPin, unlockedSalt]);

  // 3. Subscribe to Memory Timeline items
  useEffect(() => {
    if (!coupleId || !unlockedPin) return;

    const memsCollRef = collection(db, "couples", coupleId, "privateHub", "memories", "items");
    const unsubscribe = onSnapshot(memsCollRef, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MemoryDoc[];
      // Sort chronologically descending
      docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMemories(docs);
    });

    return () => unsubscribe();
  }, [coupleId, unlockedPin]);

  // Handle Writing New Encrypted Love Letter
  const handleSaveLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !user?.uid || !unlockedPin || !unlockedSalt || !newLetterText.trim()) return;

    setIsEncrypting(true);
    try {
      // AES-GCM Client-Side Encryption
      const { cipherText, ivHex } = await encryptLetter(newLetterText.trim(), unlockedPin, unlockedSalt);

      const letterId = `letter_${Date.now()}`;
      const letterDocRef = doc(db, "couples", coupleId, "privateHub", "letters", "items", letterId);

      await setDoc(letterDocRef, {
        cipherText,
        ivHex,
        authorUid: user.uid,
        authorName: myName,
        dateStr: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        createdAt: serverTimestamp(),
      });

      setNewLetterText("");
    } catch (err) {
      console.error("Error encrypting love letter:", err);
    } finally {
      setIsEncrypting(false);
    }
  };

  // Handle Adding New Memory Timeline Item
  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !user?.uid || !newMemTitle.trim() || !newMemNote.trim()) return;

    setIsSavingMem(true);
    try {
      let uploadedPhotoUrl = "";

      if (newMemPhoto) {
        const fileRef = storageRef(storage, `couples/${coupleId}/memories/${Date.now()}_${newMemPhoto.name}`);
        await uploadBytes(fileRef, newMemPhoto);
        uploadedPhotoUrl = await getDownloadURL(fileRef);
      }

      const memId = `mem_${Date.now()}`;
      const memDocRef = doc(db, "couples", coupleId, "privateHub", "memories", "items", memId);

      await setDoc(memDocRef, {
        title: newMemTitle.trim(),
        date: newMemDate,
        note: newMemNote.trim(),
        photoUrl: uploadedPhotoUrl,
        authorName: myName,
        createdAt: serverTimestamp(),
      });

      setNewMemTitle("");
      setNewMemNote("");
      setNewMemPhoto(null);
    } catch (err) {
      console.error("Error saving memory timeline:", err);
    } finally {
      setIsSavingMem(false);
    }
  };

  if (loading || !user || !couple) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Private Hub...</p>
      </div>
    );
  }

  // If Vault is Locked -> Show PIN Gate Modal
  if (!unlockedPin || !unlockedSalt) {
    return <PinGate onUnlock={(pin, salt) => {
      setUnlockedPin(pin);
      setUnlockedSalt(salt);
    }} />;
  }

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Private Hub Vault</span>
            <Lock className="w-6 h-6 text-emerald-400" />
          </h1>
          <p className="text-sm text-rose-200/70 mt-1">
            End-to-End Encrypted space for {myName} & {partnerName}.
          </p>
        </div>

        {/* Relock Button */}
        <button
          onClick={() => {
            setUnlockedPin(null);
            setUnlockedSalt(null);
          }}
          className="px-4 py-2 rounded-2xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-xs font-bold text-rose-300 flex items-center space-x-2 shadow-glow self-start md:self-auto"
        >
          <KeyRound className="w-4 h-4 text-amber-300" />
          <span>Lock Vault</span>
        </button>
      </div>

      {/* Security Status Badge */}
      <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200 flex items-center space-x-3 shadow-glow">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <p className="leading-relaxed">
          <span className="font-bold">Web Crypto AES-GCM 256-Bit Active:</span> Your love letters are encrypted in your browser before saving to Firestore. Raw database inspect shows only unreadable ciphertext.
        </p>
      </div>

      {/* Hub Tabs: Love Letters vs Memory Timeline */}
      <div className="flex bg-wine-950/80 p-1.5 rounded-2xl border border-rose-500/20">
        <button
          onClick={() => setActiveTab("letters")}
          className={`flex-1 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 transition-all ${
            activeTab === "letters"
              ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
              : "text-rose-300/70 hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Encrypted Love Letters ({decryptedLetters.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("memories")}
          className={`flex-1 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 transition-all ${
            activeTab === "memories"
              ? "bg-gradient-to-r from-rose-600 to-wine-700 text-white shadow-glow"
              : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Memory Timeline ({memories.length})</span>
        </button>
      </div>

      {/* TAB 1: LOVE LETTERS */}
      {activeTab === "letters" && (
        <div className="space-y-6">
          {/* Write Letter Form */}
          <div className="moi-card p-6 md:p-8 bg-wine-950/90 border border-rose-500/30 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
              <span>Write a Private Love Letter</span>
            </h3>

            <form onSubmit={handleSaveLetter} className="space-y-4">
              <textarea
                required
                rows={4}
                value={newLetterText}
                onChange={(e) => setNewLetterText(e.target.value)}
                placeholder={`Write something heartfelt for ${partnerName}...`}
                className="w-full p-4 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-xs md:text-sm placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none leading-relaxed"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isEncrypting}
                  className="moi-button-primary px-6 py-3 text-xs font-extrabold flex items-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{isEncrypting ? "Encrypting AES-256..." : "Encrypt & Send Letter"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Decrypted Letters List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider">
              Your Shared Letters
            </h3>

            {decryptedLetters.length === 0 ? (
              <div className="moi-card p-8 text-center text-xs text-rose-300/50 italic">
                No love letters written yet. Write the first encrypted letter above!
              </div>
            ) : (
              decryptedLetters.map((l) => (
                <div
                  key={l.id}
                  className="moi-card p-6 md:p-8 bg-gradient-to-br from-[#2D0B1F]/90 to-[#1C0512]/90 border border-rose-500/30 space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-xs font-bold border-b border-rose-900/40 pb-2">
                    <span className="text-rose-300 font-semibold">From: {l.authorName}</span>
                    <span className="text-rose-200/60 font-mono text-[11px]">{l.dateStr}</span>
                  </div>

                  <p className="text-sm text-white leading-relaxed font-serif italic whitespace-pre-wrap pt-1">
                    "{l.plainText}"
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MEMORY TIMELINE */}
      {activeTab === "memories" && (
        <div className="space-y-6">
          {/* Add Memory Form */}
          <div className="moi-card p-6 md:p-8 bg-wine-950/90 border border-rose-500/30 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-300" />
              <span>Add a Special Memory</span>
            </h3>

            <form onSubmit={handleSaveMemory} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  value={newMemTitle}
                  onChange={(e) => setNewMemTitle(e.target.value)}
                  placeholder="Memory Title (e.g. First Beach Trip 🏖️)"
                  className="p-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-xs placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none"
                  style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                />

                <input
                  type="date"
                  required
                  value={newMemDate}
                  onChange={(e) => setNewMemDate(e.target.value)}
                  className="p-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-xs focus:border-rose-400 focus:outline-none"
                  style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                />
              </div>

              <textarea
                required
                rows={3}
                value={newMemNote}
                onChange={(e) => setNewMemNote(e.target.value)}
                placeholder="Write a short note about this memory..."
                className="w-full p-4 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-xs placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none leading-relaxed"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-2 text-xs text-rose-300">
                  <ImageIcon className="w-4 h-4 text-amber-300" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setNewMemPhoto(e.target.files[0]);
                      }
                    }}
                    className="text-xs text-rose-200/80 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-rose-500/20 file:text-rose-300 file:font-semibold cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingMem}
                  className="moi-button-primary px-6 py-3 text-xs font-extrabold flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSavingMem ? "Saving Memory..." : "Save to Timeline"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Chronological Timeline List */}
          <div className="space-y-6 pt-4 relative">
            {/* Timeline Vertical Line */}
            <div className="absolute left-6 top-8 bottom-4 w-0.5 bg-rose-500/30 hidden sm:block" />

            {memories.length === 0 ? (
              <div className="moi-card p-8 text-center text-xs text-rose-300/50 italic">
                No memories saved yet. Add your first couple memory above!
              </div>
            ) : (
              memories.map((mem) => (
                <div key={mem.id} className="relative sm:pl-14">
                  {/* Timeline Dot */}
                  <div className="absolute left-4 top-6 w-4 h-4 rounded-full bg-rose-500 border-4 border-[#16060E] shadow-glow hidden sm:block" />

                  <div className="moi-card p-6 md:p-8 bg-gradient-to-br from-[#2D0B1F]/90 to-[#1C0512]/90 border border-rose-500/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="text-lg font-bold text-white">{mem.title}</h4>
                      <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{mem.date}</span>
                      </span>
                    </div>

                    <p className="text-xs md:text-sm text-rose-100/90 leading-relaxed">
                      {mem.note}
                    </p>

                    {mem.photoUrl && (
                      <div className="mt-3 rounded-2xl overflow-hidden border border-rose-500/30 max-h-80">
                        <img
                          src={mem.photoUrl}
                          alt={mem.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <p className="text-[11px] text-rose-300/60 font-semibold pt-2 border-t border-rose-900/30">
                      Saved by {mem.authorName}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
