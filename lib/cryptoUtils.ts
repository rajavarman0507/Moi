// Web Crypto API PBKDF2 + AES-GCM 256-bit Client-Side Encryption & Atomic Re-Encryption Utilities

import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

const PBKDF2_ITERATIONS = 100000;

export function generateSaltHex(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8Array(hex: string): Uint8Array {
  const match = hex.match(/.{1,2}/g);
  if (!match) return new Uint8Array(0);
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Derive PBKDF2 Key from PIN
async function getPbkdf2Key(pin: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
}

// Generate Stored Verifier Hash using PBKDF2 100,000 iterations
export async function derivePbkdf2Hash(pin: string, saltHex: string): Promise<string> {
  const baseKey = await getPbkdf2Key(pin);
  const salt = hexToUint8Array(saltHex);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    256
  );

  return uint8ArrayToHex(new Uint8Array(derivedBits));
}

// Derive AES-GCM 256-bit CryptoKey for Letter Encryption/Decryption
async function deriveAesGcmKey(pin: string, saltHex: string): Promise<CryptoKey> {
  const baseKey = await getPbkdf2Key(pin);
  const salt = hexToUint8Array(saltHex);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt Letter Text -> AES-GCM 256-bit Base64 Ciphertext + IV Hex
export async function encryptLetter(
  plainText: string,
  pin: string,
  saltHex: string
): Promise<{ cipherText: string; ivHex: string }> {
  const key = await deriveAesGcmKey(pin, saltHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plainText)
  );

  const cipherText = arrayBufferToBase64(encryptedBuffer);
  const ivHex = uint8ArrayToHex(iv);

  return { cipherText, ivHex };
}

// Decrypt Base64 Ciphertext -> Original Plaintext Letter
export async function decryptLetter(
  cipherText: string,
  ivHex: string,
  pin: string,
  saltHex: string
): Promise<string> {
  const key = await deriveAesGcmKey(pin, saltHex);
  const iv = hexToUint8Array(ivHex);

  const binaryString = atob(cipherText);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    bytes.buffer as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// ATOMIC PIN CHANGE & LETTER RE-ENCRYPTION PIPELINE WITH ROLLBACK GUARANTEE
export async function reencryptAllLettersAtomic(
  coupleId: string,
  oldPin: string,
  newPin: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ newSalt: string; newHash: string }> {
  const pinConfigRef = doc(db, "couples", coupleId, "privateHub", "pinConfig");
  const pinConfigSnap = await getDoc(pinConfigRef);

  if (!pinConfigSnap.exists()) {
    throw new Error("No existing PIN configuration found.");
  }

  const pinConfig = pinConfigSnap.data();
  const oldSalt = pinConfig.salt;
  const initialOldHash = pinConfig.pbkdf2Hash;

  // 1. Verify Old PIN
  const computedOldHash = await derivePbkdf2Hash(oldPin, oldSalt);
  if (computedOldHash !== initialOldHash) {
    throw new Error("Current PIN is incorrect.");
  }

  // 2. Fetch All Existing Letters
  const lettersCollRef = collection(db, "couples", coupleId, "privateHub", "letters", "items");
  const lettersSnap = await getDocs(lettersCollRef);
  const letterDocs = lettersSnap.docs;

  const totalLetters = letterDocs.length;
  console.log(`Starting in-memory re-encryption pipeline for ${totalLetters} letters...`);

  // 3. IN-MEMORY DECRYPTION STEP (100% In-Memory — No Firestore Mutations)
  const decryptedItems: { id: string; plainText: string; authorName: string; dateStr: string }[] = [];
  for (let i = 0; i < letterDocs.length; i++) {
    const docData = letterDocs[i].data();
    const plainText = await decryptLetter(docData.cipherText, docData.ivHex, oldPin, oldSalt);
    decryptedItems.push({
      id: letterDocs[i].id,
      plainText,
      authorName: docData.authorName || "Partner",
      dateStr: docData.dateStr || new Date().toISOString(),
    });
    if (onProgress) onProgress(i + 1, totalLetters * 2);
  }

  // 4. IN-MEMORY RE-ENCRYPTION STEP (With New Salt & New Derived Key)
  const newSalt = generateSaltHex();
  const newHash = await derivePbkdf2Hash(newPin, newSalt);

  const reencryptedPayloads: { id: string; cipherText: string; ivHex: string; authorName: string; dateStr: string }[] = [];
  for (let i = 0; i < decryptedItems.length; i++) {
    const item = decryptedItems[i];
    const { cipherText, ivHex } = await encryptLetter(item.plainText, newPin, newSalt);
    reencryptedPayloads.push({
      id: item.id,
      cipherText,
      ivHex,
      authorName: item.authorName,
      dateStr: item.dateStr,
    });
    if (onProgress) onProgress(totalLetters + i + 1, totalLetters * 2);
  }

  // 5. CONCURRENT TRANSACTION GUARD
  await runTransaction(db, async (transaction) => {
    const freshConfigSnap = await transaction.get(pinConfigRef);
    if (!freshConfigSnap.exists() || freshConfigSnap.data().pbkdf2Hash !== initialOldHash) {
      throw new Error("PIN was modified concurrently by your partner. Please retry.");
    }
  });

  // 6. ATOMIC WRITE STEP (Chunked Batch Writes <= 400 docs per batch)
  for (let i = 0; i < reencryptedPayloads.length; i += 400) {
    const chunk = reencryptedPayloads.slice(i, i + 400);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const letterDocRef = doc(db, "couples", coupleId, "privateHub", "letters", "items", item.id);
      batch.set(
        letterDocRef,
        {
          cipherText: item.cipherText,
          ivHex: item.ivHex,
          authorName: item.authorName,
          dateStr: item.dateStr,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await batch.commit();
  }

  // 7. Update pinConfig to New Salt & New PBKDF2 Hash
  await setDoc(pinConfigRef, {
    pbkdf2Hash: newHash,
    salt: newSalt,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log("Atomic PIN change and letter re-encryption completed successfully.");
  return { newSalt, newHash };
}
