"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import PinGate from "@/components/PinGate";
import { encryptWithKey, decryptWithKey } from "@/lib/cryptoUtils";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limitToLast,
  limit,
  serverTimestamp,
  writeBatch,
  getCountFromServer,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  Send,
  Lock,
  ShieldCheck,
  CheckCheck,
  Check,
  MessageCircle,
  Info,
  Sparkles,
  Smile,
  X,
} from "lucide-react";

interface ChatMessage {
  id: string;
  cipherText: string;
  ivHex: string;
  senderUid: string;
  read: boolean;
  createdAt: any;
  text?: string;
  isOptimistic?: boolean;
}

// Mobile Chat Categorized Emoji Data
const EMOJI_CATEGORIES = [
  {
    name: "Love & Romance",
    emojis: [
      "❤️", "💕", "💖", "💗", "💓", "💞", "💘", "💌",
      "🌹", "🌸", "🌺", "🌷", "💍", "💎", "💋", "💒",
      "🥂", "🕯️", "🧸", "🎁", "👩‍❤️‍👨", "👩‍❤️‍💋‍👨", "🫶", "🥰"
    ],
  },
  {
    name: "Sweet Expressions",
    emojis: [
      "😘", "😍", "😋", "😊", "🥳", "🥺", "🥹", "😉",
      "🤪", "🤩", "🤗", "😴", "🤫", "🤭", "😇", "😌",
      "🤤", "🤤", "🤭", "🫡", "🤗", "😻", "🙈", "✨"
    ],
  },
  {
    name: "Fun & Vibes",
    emojis: [
      "🔥", "✨", "⭐", "🌟", "🌙", "💫", "🌈", "🎉",
      "🎊", "🎈", "🍾", "🍷", "🍰", "🍦", "🍭", "🍩",
      "🍕", "🍿", "🎵", "🎶", "👑", "🐣", "🦋", "💯"
    ],
  },
  {
    name: "Gestures & Hands",
    emojis: [
      "👍", "🤌", "🫰", "🤝", "👏", "🙌", "🫶", "👐",
      "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
      "👇", "👋", "🤚", "🖐️", "✋", "🖖", "🙏", "💪"
    ],
  },
];

const QUICK_EMOJIS = ["❤️", "😘", "💖", "🥰", "🌹", "💋", "🔥", "✨", "🥺", "👍", "🥳", "💍"];

export default function ChatPage() {
  const { user, couple, partnerProfile, userProfile } = useAuth();
  const { cryptoKey, isUnlocked, unlockChat, lockChat, resetInactivityTimer } = useChat();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [partnerIsTyping, setPartnerIsTyping] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingStateRef = useRef<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const coupleId = couple?.id;
  const partnerUid = couple?.userIds?.find((id) => id !== user?.uid);

  // Auto-scroll to bottom of messages
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. Mark partner messages as read in a single batch
  const markMessagesAsRead = useCallback(
    async (msgs: ChatMessage[]) => {
      if (!coupleId || !user?.uid) return;

      const unreadPartnerMsgs = msgs.filter(
        (m) => m.senderUid !== user.uid && !m.read && !m.isOptimistic
      );

      if (unreadPartnerMsgs.length === 0) return;

      try {
        const batch = writeBatch(db);
        unreadPartnerMsgs.forEach((m) => {
          const msgRef = doc(db, "couples", coupleId, "chatMessages", m.id);
          batch.update(msgRef, {
            read: true,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } catch (err) {
        console.error("Error marking messages read:", err);
      }
    },
    [coupleId, user?.uid]
  );

  // 2. Real-time message listener with client-side decryption using pre-derived key
  useEffect(() => {
    if (!isUnlocked || !cryptoKey || !coupleId) return;

    const msgsCollRef = collection(db, "couples", coupleId, "chatMessages");
    const q = query(msgsCollRef, orderBy("createdAt", "asc"), limitToLast(100));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const rawDocs = snapshot.docs;

        const decryptedPromises = rawDocs.map(async (docSnap) => {
          const data = docSnap.data();
          let decryptedText = "[Encrypted Message]";

          if (data.cipherText && data.ivHex) {
            try {
              decryptedText = await decryptWithKey(data.cipherText, data.ivHex, cryptoKey);
            } catch (e) {
              console.error("Decryption failed for message:", docSnap.id, e);
            }
          }

          return {
            id: docSnap.id,
            cipherText: data.cipherText,
            ivHex: data.ivHex,
            senderUid: data.senderUid,
            read: !!data.read,
            createdAt: data.createdAt,
            text: decryptedText,
          } as ChatMessage;
        });

        const decryptedList = await Promise.all(decryptedPromises);
        setMessages(decryptedList);

        // Mark incoming unread partner messages as read
        markMessagesAsRead(decryptedList);

        // Scroll to bottom
        setTimeout(() => scrollToBottom("smooth"), 50);
      },
      (err) => {
        console.error("Messages snapshot error:", err);
      }
    );

    return () => unsubscribe();
  }, [isUnlocked, cryptoKey, coupleId, markMessagesAsRead]);

  // 3. Listen to partner typing indicator
  useEffect(() => {
    if (!isUnlocked || !coupleId || !partnerUid) return;

    const partnerTypingRef = doc(db, "couples", coupleId, "chatTyping", partnerUid);

    const unsubscribe = onSnapshot(partnerTypingRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.isTyping) {
          setPartnerIsTyping(true);
        } else {
          setPartnerIsTyping(false);
        }
      } else {
        setPartnerIsTyping(false);
      }
    });

    return () => unsubscribe();
  }, [isUnlocked, coupleId, partnerUid]);

  // Helper to set current user's typing status
  const setUserTypingStatus = async (isTyping: boolean) => {
    if (!coupleId || !user?.uid) return;
    try {
      const typingRef = doc(db, "couples", coupleId, "chatTyping", user.uid);
      await setDoc(
        typingRef,
        {
          isTyping,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      isTypingStateRef.current = isTyping;
    } catch (e) {
      console.error("Error setting typing status:", e);
    }
  };

  // Cleanup typing status on unmount
  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      if (isTypingStateRef.current && coupleId && user?.uid) {
        setUserTypingStatus(false);
      }
    };
  }, [coupleId, user?.uid]);

  // Handle Input Change & Debounced Typing Indicator (2.5s idle)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    resetInactivityTimer();

    if (!isTypingStateRef.current) {
      setUserTypingStatus(true);
    }

    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
    }

    typingDebounceRef.current = setTimeout(() => {
      setUserTypingStatus(false);
    }, 2500);
  };

  // Append Emoji to input text
  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    resetInactivityTimer();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // 4. Auto-Pruning logic (removes items beyond 300 when count > 500)
  const checkAndPruneMessages = async () => {
    if (!coupleId) return;
    try {
      const collRef = collection(db, "couples", coupleId, "chatMessages");
      const countSnap = await getCountFromServer(collRef);
      const totalCount = countSnap.data().count;

      if (totalCount > 500) {
        const deleteCount = totalCount - 300;
        const oldestQuery = query(collRef, orderBy("createdAt", "asc"), limit(deleteCount));
        const oldestSnap = await getDocs(oldestQuery);

        const batch = writeBatch(db);
        oldestSnap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
      }
    } catch (e) {
      console.error("Pruning messages error:", e);
    }
  };

  // 5. Ultra-Fast Sub-Second Message Delivery (Optimistic UI + Async Writes)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || !cryptoKey || !coupleId || !user?.uid) return;

    // 1. Instant local reset & optimistic bubble insertion (0ms latency!)
    setInputText("");
    setShowEmojiPicker(false);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      cipherText: "",
      ivHex: "",
      senderUid: user.uid,
      read: false,
      createdAt: new Date(),
      text: textToSend,
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom("auto"), 10);

    // Clear typing status immediately
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    setUserTypingStatus(false);

    // 2. Asynchronous background encryption & Firestore write
    try {
      const { cipherText, ivHex } = await encryptWithKey(textToSend, cryptoKey);

      const msgsCollRef = collection(db, "couples", coupleId, "chatMessages");
      await addDoc(msgsCollRef, {
        cipherText,
        ivHex,
        senderUid: user.uid,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Trigger Zero-Plaintext Notification asynchronously
      if (partnerUid) {
        const notifCollRef = collection(db, "couples", coupleId, "notifications");
        const senderName = userProfile?.displayName || "Your partner";
        addDoc(notifCollRef, {
          toUserId: partnerUid,
          type: "chat",
          title: "New Message",
          body: `New message from ${senderName} 💬`,
          createdAt: serverTimestamp(),
          read: false,
        }).catch((e) => console.error("Notification send error:", e));
      }

      // Check & prune message storage asynchronously
      checkAndPruneMessages().catch((e) => console.error("Pruning error:", e));
    } catch (err) {
      console.error("Error sending encrypted message:", err);
      // Remove optimistic msg on hard failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  // Format message time string
  const formatMsgTime = (timestamp: any) => {
    if (!timestamp) return "...";
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // If chat is locked, present PinGate
  if (!isUnlocked || !cryptoKey) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="text-center space-y-2 mb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-2">
            <MessageCircle className="w-8 h-8 text-rose-400" />
            <span>Encrypted Couple Chat</span>
          </h1>
          <p className="text-sm text-rose-300/70">
            End-to-end client-side encrypted real-time messaging for two.
          </p>
        </div>

        <PinGate
          onUnlock={async (pin) => {
            const success = await unlockChat(pin);
            if (!success) {
              throw new Error("Invalid PIN");
            }
          }}
        />
      </div>
    );
  }

  // UNLOCKED CHAT UI - Unified outer border for 100% continuous border visibility
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] rounded-3xl border border-rose-500/40 bg-[#16060E]/95 overflow-hidden shadow-2xl relative">
      {/* Header & Lock Button */}
      <div className="flex items-center justify-between p-4 bg-[#230917]/95 backdrop-blur-xl border-b border-rose-500/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-wine-600 flex items-center justify-center text-white shadow-glow">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>{partnerProfile?.displayName || "Partner Chat"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>AES-256 E2EE</span>
              </span>
            </h2>
            <p className="text-xs text-rose-300/70">
              Messages are encrypted in your browser before saving
            </p>
          </div>
        </div>

        <button
          onClick={lockChat}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all"
          title="Lock Chat Session"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lock Chat</span>
        </button>
      </div>

      {/* Retention Trade-off Notice Banner */}
      <div className="px-4 py-2 bg-rose-950/50 border-b border-rose-500/20 text-rose-200/90 text-xs flex items-center gap-2">
        <Info className="w-4 h-4 text-rose-400 shrink-0" />
        <p className="leading-snug">
          <strong className="text-white">Note:</strong> Chat keeps your 300 most recent encrypted messages. (Love letters in Private Hub remain saved forever!).
        </p>
      </div>

      {/* Messages Scroll Area - Continuous Crisp Border Line */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#170610]/95">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-rose-300/60 space-y-3">
            <Sparkles className="w-10 h-10 text-rose-400/50 animate-pulse" />
            <p className="text-sm font-medium">No messages yet in your encrypted chat.</p>
            <p className="text-xs max-w-xs text-rose-300/40">
              Send your partner a sweet message! Only the two of you can decrypt and read what is sent.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderUid === user?.uid;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-md break-words ${
                    isMe
                      ? "bg-gradient-to-r from-rose-600 to-wine-600 text-white rounded-br-none border border-rose-400/30"
                      : "bg-[#2A0C1E] text-rose-100 rounded-bl-none border border-rose-800/40"
                  }`}
                >
                  <p>{msg.text}</p>
                </div>

                <div
                  className={`flex items-center space-x-1 mt-1 text-[10px] text-rose-300/50 ${
                    isMe ? "pr-1" : "pl-1"
                  }`}
                >
                  <span>{formatMsgTime(msg.createdAt)}</span>
                  {isMe && (
                    <span className="ml-1" title={msg.read ? "Read by partner" : "Sent"}>
                      {msg.read ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          <span>seen</span>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </span>
                      ) : (
                        <Check className="w-3.5 h-3.5 text-rose-300/60" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live Partner Typing Indicator */}
        {partnerIsTyping && (
          <div className="flex items-center space-x-2 text-xs text-rose-300/70 italic pl-2 pt-1 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            <span>{partnerProfile?.displayName || "Partner"} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Categorized Mobile Emoji Picker Panel */}
      {showEmojiPicker && (
        <div className="p-3 bg-[#1F0816] border-t border-rose-500/30 shadow-2xl max-h-56 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between border-b border-rose-900/40 pb-1.5">
            <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-rose-400" />
              <span>Tap an emoji to send</span>
            </span>
            <button
              onClick={() => setShowEmojiPicker(false)}
              className="p-1 rounded-lg hover:bg-rose-950 text-rose-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {EMOJI_CATEGORIES.map((category) => (
            <div key={category.name} className="space-y-1">
              <h4 className="text-[11px] font-semibold text-rose-300/70">{category.name}</h4>
              <div className="grid grid-cols-8 sm:grid-cols-12 gap-1 text-xl">
                {category.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="p-1.5 hover:bg-rose-900/40 rounded-xl transition-all hover:scale-125 text-center"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Emoji Bar */}
      <div className="px-3 py-1.5 bg-[#1F0816]/90 border-t border-rose-500/20 flex items-center space-x-1 overflow-x-auto scrollbar-none">
        <span className="text-[10px] font-semibold text-rose-300/60 shrink-0 pr-1">Quick:</span>
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => addEmoji(emoji)}
            className="px-2 py-0.5 hover:bg-rose-900/50 rounded-lg text-base transition-transform active:scale-125 shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Message Input & Send Form */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 md:p-4 bg-[#230917] border-t border-rose-500/30 flex items-center space-x-2"
      >
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2.5 rounded-2xl border transition-all ${
            showEmojiPicker
              ? "bg-rose-600 text-white border-rose-400"
              : "bg-[#16060E] text-rose-300/70 border-rose-500/30 hover:text-rose-200 hover:border-rose-400"
          }`}
          title="Toggle Mobile Emoji Picker"
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Type an encrypted message..."
          className="flex-1 bg-[#16060E] border border-rose-500/30 text-white placeholder:text-rose-300/40 text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-400 transition-colors"
          style={{ color: "#FFFFFF", backgroundColor: "#16060E" }}
        />

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="moi-button-primary px-5 py-3 rounded-2xl flex items-center justify-center space-x-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4 text-white" />
          <span className="hidden sm:inline font-bold text-xs">Send</span>
        </button>
      </form>
    </div>
  );
}
