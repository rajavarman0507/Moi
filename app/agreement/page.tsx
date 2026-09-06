"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import PinGate from "@/components/PinGate";
import SignaturePad from "@/components/SignaturePad";
import {
  deriveAesGcmKeyFromPin,
  encryptWithKey,
  decryptWithKey,
} from "@/lib/cryptoUtils";
import {
  AGREEMENT_PROMISES,
  FULL_AGREEMENT_TEXT,
} from "@/lib/agreementData";
import {
  Heart,
  Sparkles,
  Shield,
  MessageCircle,
  Sun,
  CheckCircle2,
  Lock,
  Clock,
  Award,
  AlertCircle,
  FileCheck,
} from "lucide-react";

interface SignatureDoc {
  cipherText: string;
  ivHex: string;
  signerUid: string;
  signerName: string;
  signedAt?: any;
}

export default function AgreementPage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading } = useAuth();

  // Vault Security State
  const [unlockedKey, setUnlockedKey] = useState<CryptoKey | null>(null);
  const [unlockedPin, setUnlockedPin] = useState<string | null>(null);
  const [unlockedSalt, setUnlockedSalt] = useState<string | null>(null);

  // Signatures State from Firestore
  const [signaturesMap, setSignaturesMap] = useState<Record<string, SignatureDoc>>({});
  const [decryptedSignatures, setDecryptedSignatures] = useState<Record<string, string>>({});
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const coupleId = couple?.id;
  const myUid = user?.uid;
  const partnerUid = couple?.userIds?.find((id) => id !== myUid);

  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  // 1. Ensure Parent Agreement Document Exists
  useEffect(() => {
    if (!coupleId) return;

    const parentDocRef = doc(db, "couples", coupleId, "agreement", "main");
    getDoc(parentDocRef).then((snap) => {
      if (!snap.exists()) {
        setDoc(
          parentDocRef,
          {
            text: FULL_AGREEMENT_TEXT,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((err) => console.warn("Error creating parent agreement main doc:", err));
      }
    }).catch((err) => console.warn("Error checking parent agreement doc:", err));
  }, [coupleId]);

  // 2. Subscribe to Firestore Signatures Subcollection
  useEffect(() => {
    if (!coupleId) return;

    const sigsCollRef = collection(db, "couples", coupleId, "agreement", "main", "signatures");
    const unsubscribe = onSnapshot(
      sigsCollRef,
      (snap) => {
        const map: Record<string, SignatureDoc> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as SignatureDoc;
        });
        setSignaturesMap(map);
      },
      (err) => console.error("Error subscribing to agreement signatures:", err)
    );

    return () => unsubscribe();
  }, [coupleId]);

  // 3. Handle Vault Unlock via PinGate
  const handleUnlockVault = async (pin: string, saltHex: string) => {
    try {
      const key = await deriveAesGcmKeyFromPin(pin, saltHex);
      setUnlockedKey(key);
      setUnlockedPin(pin);
      setUnlockedSalt(saltHex);
    } catch (err) {
      console.error("Error deriving key on vault unlock:", err);
      setErrorMsg("Failed to derive encryption key.");
    }
  };

  // 4. Decrypt Signatures when Key is Available
  useEffect(() => {
    if (!unlockedKey || Object.keys(signaturesMap).length === 0) return;

    setIsDecrypting(true);
    const decryptAll = async () => {
      const decryptedMap: Record<string, string> = {};
      for (const [uid, sigDoc] of Object.entries(signaturesMap)) {
        if (sigDoc.cipherText && sigDoc.ivHex) {
          try {
            const plainDataUrl = await decryptWithKey(sigDoc.cipherText, sigDoc.ivHex, unlockedKey);
            decryptedMap[uid] = plainDataUrl;
          } catch (e) {
            console.error(`Failed to decrypt signature for user ${uid}:`, e);
          }
        }
      }
      setDecryptedSignatures(decryptedMap);
      setIsDecrypting(false);
    };

    decryptAll();
  }, [unlockedKey, signaturesMap]);

  // 5. Handle Signature Submission
  const handleSaveSignature = async (signatureDataUrl: string) => {
    if (!coupleId || !myUid || !unlockedKey || isSigning) return;
    setIsSigning(true);
    setErrorMsg(null);

    try {
      // Client-side encryption of raw signature PNG Data URL
      const { cipherText, ivHex } = await encryptWithKey(signatureDataUrl, unlockedKey);

      const sigDocRef = doc(db, "couples", coupleId, "agreement", "main", "signatures", myUid);
      await setDoc(sigDocRef, {
        cipherText,
        ivHex,
        signerUid: myUid,
        signerName: myName,
        signedAt: serverTimestamp(),
      });

      // Instantly add to decrypted map for responsive local UI
      setDecryptedSignatures((prev) => ({ ...prev, [myUid]: signatureDataUrl }));
    } catch (err: any) {
      console.error("Error saving agreement signature:", err);
      setErrorMsg(err.message || "Failed to save signature.");
    } finally {
      setIsSigning(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <Sparkles className="w-8 h-8 animate-pulse text-rose-400" />
        <p className="text-xs font-semibold mt-3 animate-pulse">Loading Agreement Vault...</p>
      </div>
    );
  }

  // Vault Lock Screen
  if (!unlockedKey) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-2">
            <span>Symbolic Couple Agreement</span>
            <FileCheck className="w-6 h-6 text-amber-300" />
          </h1>
          <p className="text-xs text-rose-200/70">
            Please enter your shared couple PIN to unlock your agreement vault.
          </p>
        </div>
        <PinGate onUnlock={handleUnlockVault} />
      </div>
    );
  }

  const mySignature = myUid ? signaturesMap[myUid] : null;
  const partnerSignature = partnerUid ? signaturesMap[partnerUid] : null;

  const hasMySigned = !!mySignature;
  const hasPartnerSigned = !!partnerSignature;
  const isBothSigned = hasMySigned && hasPartnerSigned;

  const getPromiseIcon = (iconName: string) => {
    switch (iconName) {
      case "MessageCircle": return <MessageCircle className="w-5 h-5 text-rose-400" />;
      case "Heart": return <Heart className="w-5 h-5 text-rose-400" />;
      case "Sparkles": return <Sparkles className="w-5 h-5 text-amber-300" />;
      case "Shield": return <Shield className="w-5 h-5 text-rose-400" />;
      case "Sun": return <Sun className="w-5 h-5 text-amber-300" />;
      default: return <Heart className="w-5 h-5 text-rose-400" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 relative z-10">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-extrabold border border-rose-400/30 inline-flex items-center gap-1.5 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Keepsake Certificate of Love</span>
        </span>
        <h1 className="text-3xl font-extrabold text-white">Symbolic Couple Agreement</h1>
        <p className="text-xs text-rose-200/70 max-w-lg mx-auto">
          A sincere set of promises to nourish, protect, and cherish your unique connection.
        </p>
      </div>

      {/* Explicit Non-Legal Disclaimer Alert */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs flex items-start space-x-3 shadow-md">
        <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        <p className="leading-relaxed font-medium">
          <strong className="text-amber-100 font-bold">Symbolic Notice:</strong> This is a symbolic promise between you two — not a legally binding document.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs font-bold text-rose-300 text-center">
          {errorMsg}
        </div>
      )}

      {/* STATE C: BOTH SIGNED — COMPLETED KEEPSAKE CERTIFICATE */}
      {isBothSigned ? (
        <div className="moi-card p-8 sm:p-12 bg-gradient-to-b from-[#2D0B1E] via-[#1F0713] to-[#17040E] border-2 border-amber-400/40 shadow-2xl relative overflow-hidden space-y-8">
          {/* Certificate Header */}
          <div className="text-center space-y-3 border-b border-amber-400/20 pb-6">
            <div className="w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 mx-auto flex items-center justify-center text-amber-300 shadow-glow">
              <Award className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-mono tracking-widest text-amber-300 uppercase font-bold">
              Official Couple Keepsake Certificate
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
              {myName} & {partnerName}
            </h2>
            <p className="text-xs font-serif italic text-rose-200/80">
              Bound together by mutual love, respect, and enduring devotion.
            </p>
          </div>

          {/* Promises List */}
          <div className="space-y-4">
            {AGREEMENT_PROMISES.map((promise, idx) => (
              <div
                key={promise.id}
                className="p-4 rounded-xl bg-wine-900/30 border border-rose-500/20 space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-amber-300 font-mono">0{idx + 1}.</span>
                  <h3 className="text-xs font-bold text-white">{promise.title}</h3>
                </div>
                <p className="text-xs text-rose-200/80 pl-6 leading-relaxed">
                  {promise.statement}
                </p>
              </div>
            ))}
          </div>

          {/* Side-by-Side Decrypted Signatures */}
          <div className="pt-6 border-t border-amber-400/20 space-y-4">
            <div className="text-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300/80 font-bold">
                Immutably Signed & Encrypted
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Partner 1 Signature */}
              <div className="p-4 rounded-2xl bg-[#FFFBF5] text-center space-y-2 border border-amber-400/30 shadow-md">
                <span className="text-[10px] font-bold text-rose-950 uppercase tracking-wider block">
                  Signed by {myUid && signaturesMap[myUid]?.signerName || myName}
                </span>
                <div className="h-24 flex items-center justify-center">
                  {myUid && decryptedSignatures[myUid] ? (
                    <img
                      src={decryptedSignatures[myUid]}
                      alt="Signature"
                      className="max-h-20 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-mono text-rose-900/40 animate-pulse">
                      {isDecrypting ? "Decrypting..." : "Signature Attached"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-rose-900/60 border-t border-rose-900/10 pt-1">
                  Verified Vault Signature
                </p>
              </div>

              {/* Partner 2 Signature */}
              <div className="p-4 rounded-2xl bg-[#FFFBF5] text-center space-y-2 border border-amber-400/30 shadow-md">
                <span className="text-[10px] font-bold text-rose-950 uppercase tracking-wider block">
                  Signed by {partnerUid && signaturesMap[partnerUid]?.signerName || partnerName}
                </span>
                <div className="h-24 flex items-center justify-center">
                  {partnerUid && decryptedSignatures[partnerUid] ? (
                    <img
                      src={decryptedSignatures[partnerUid]}
                      alt="Partner Signature"
                      className="max-h-20 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-mono text-rose-900/40 animate-pulse">
                      {isDecrypting ? "Decrypting..." : "Signature Attached"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-rose-900/60 border-t border-rose-900/10 pt-1">
                  Verified Vault Signature
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STATE A & B: NOT YET FULLY SIGNED */
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-8 shadow-2xl">
          {/* Status Alert */}
          {hasMySigned ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-white">You have signed your agreement! 🖋️</p>
                <p className="text-[11px] text-emerald-200/80">
                  Waiting for {partnerName} to sign. Once both partners sign, your full Keepsake Certificate will render here.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-3">
              <Clock className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Signature Needed</p>
                <p className="text-[11px] text-rose-200/80">
                  Read the bonding statements below and add your encrypted signature to complete your agreement.
                </p>
              </div>
            </div>
          )}

          {/* Promises List */}
          <div className="space-y-4">
            <h2 className="text-base font-extrabold text-white border-b border-rose-900/40 pb-2">
              Our Symbolic Promises
            </h2>

            <div className="grid grid-cols-1 gap-3">
              {AGREEMENT_PROMISES.map((promise) => (
                <div
                  key={promise.id}
                  className="p-4 rounded-2xl bg-wine-900/30 border border-rose-500/20 flex items-start space-x-3"
                >
                  <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 shrink-0 mt-0.5">
                    {getPromiseIcon(promise.icon)}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-white">{promise.title}</h3>
                    <p className="text-xs text-rose-200/70 leading-relaxed">{promise.statement}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signature Pad Section */}
          <div className="space-y-4 pt-4 border-t border-rose-900/40">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>Your Signature</span>
              <Sparkles className="w-4 h-4 text-amber-300" />
            </h2>

            {hasMySigned ? (
              <div className="p-4 rounded-2xl bg-[#FFFBF5] text-center space-y-2 border border-rose-500/30 max-w-md mx-auto">
                <span className="text-[10px] font-bold text-rose-950 uppercase tracking-wider block">
                  Your Signed Signature (Encrypted)
                </span>
                <div className="h-24 flex items-center justify-center">
                  {myUid && decryptedSignatures[myUid] ? (
                    <img
                      src={decryptedSignatures[myUid]}
                      alt="Your Signature"
                      className="max-h-20 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-mono text-rose-900/40 animate-pulse">
                      {isDecrypting ? "Decrypting..." : "Signature Attached"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-rose-900/60 border-t border-rose-900/10 pt-1">
                  Immutably Saved in Vault
                </p>
              </div>
            ) : (
              <SignaturePad onSign={handleSaveSignature} disabled={isSigning} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
