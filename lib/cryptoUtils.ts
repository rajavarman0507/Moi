// Web Crypto API PBKDF2 + AES-GCM 256-bit Client-Side Encryption Utilities

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
