"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { Bell, Sparkles, X, CheckCircle2, Image as ImageIcon } from "lucide-react";

interface AppNotification {
  id: string;
  toUserId: string;
  type: "sketch" | "moment" | "milestone" | "online";
  title: string;
  body: string;
  imageUrl?: string;
  createdAt?: any;
}

export default function NotificationListener() {
  const { user, userProfile, couple } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [showPermissionBanner, setShowPermissionBanner] = useState<boolean>(false);

  // Active Toast Overlay State for unsupported / denied / fallback notifications
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);

  const coupleId = couple?.id;
  const userId = user?.uid;

  // 1. Check initial Notification permission state
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
      if (Notification.permission === "default") {
        setShowPermissionBanner(true);
      }
    }
  }, []);

  // Request Permission Handler with Friendly UI Explanation
  const handleRequestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        setPermission(res);
        setShowPermissionBanner(false);

        // Store FCM / Permission status on User Profile
        if (userId && res === "granted") {
          const userRef = doc(db, "users", userId);
          await setDoc(
            userRef,
            { fcmTokens: [navigator.userAgent.slice(0, 50)] },
            { merge: true }
          );
        }
      } catch (err) {
        console.error("Error requesting notification permission:", err);
      }
    }
  };

  // 2. Bounded Real-time Firestore Notification Listener with Auto-Pruning
  useEffect(() => {
    if (!coupleId || !userId) return;

    const notifCollRef = collection(db, "couples", coupleId, "notifications");
    const q = query(notifCollRef, where("toUserId", "==", userId));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        snap.docs.forEach(async (d) => {
          const notif = { id: d.id, ...d.data() } as AppNotification;
          const notifRef = doc(db, "couples", coupleId, "notifications", notif.id);

          // Check user notification preferences from Phase 6 Settings
          const notifSettings = userProfile?.notificationSettings;
          if (notif.type === "sketch" || notif.type === "moment") {
            if (notifSettings?.notifyMoments === false) {
              await deleteDoc(notifRef).catch(() => {});
              return;
            }
          }
          if (notif.type === "online") {
            if (notifSettings?.alertPartnerOnline === false) {
              await deleteDoc(notifRef).catch(() => {});
              return;
            }
          }

          // 15-Minute Staleness Protection: Don't fire popups for notifications older than 15 minutes
          const createdTime = notif.createdAt?.toMillis?.() || Date.now();
          const isStale = Date.now() - createdTime > 900000; // 15 minutes

          if (!isStale) {
            // Multi-Tab Deduplication: Only the active focused tab or primary tab fires browser notification
            const isTabFocused = document.visibilityState === "visible";

            if (permission === "granted" && "Notification" in window && isTabFocused) {
              try {
                new Notification(notif.title, {
                  body: notif.body,
                  icon: notif.imageUrl || "/favicon.ico",
                });
              } catch (e) {
                // Fallback to in-app Toast if browser throws
                setActiveToast(notif);
              }
            } else {
              // Trigger in-app Toast banner overlay fallback
              setActiveToast(notif);
            }
          }

          // Auto-Prune notification doc immediately after delivery to prevent storage growth
          await deleteDoc(notifRef).catch(() => {});
        });
      },
      (err) => console.error("Notification listener notice:", err)
    );

    return () => unsubscribe();
  }, [coupleId, userId, userProfile, permission]);

  // Toast Auto-Dismiss after 5 seconds
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => setActiveToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  return (
    <>
      {/* Friendly Permission Request Modal Banner */}
      {showPermissionBanner && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full p-4 rounded-2xl bg-gradient-to-br from-[#2F0B1E]/95 to-[#1C0512]/95 border border-rose-500/50 shadow-2xl text-white space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-rose-300 uppercase tracking-wider">
              <Bell className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Enable Couple Alerts</span>
            </div>
            <button onClick={() => setShowPermissionBanner(false)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-rose-200/80 leading-relaxed">
            Get notified when your partner sends an Instant Sketch or opens the app.
          </p>

          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-400/20 text-[10px] text-amber-200/70">
            Note: Notifications trigger while any browser tab is open.
          </div>

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button onClick={() => setShowPermissionBanner(false)} className="px-3 py-1.5 text-xs text-rose-300/70 hover:text-white font-semibold">
              Later
            </button>
            <button onClick={handleRequestPermission} className="moi-button-primary px-4 py-1.5 text-xs font-extrabold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Allow Notifications</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating In-App Toast Banner Fallback */}
      {activeToast && (
        <div className="fixed top-5 right-5 z-50 max-w-sm w-full p-4 rounded-2xl bg-gradient-to-r from-rose-950 via-wine-900 to-rose-900 border border-rose-400/50 shadow-2xl text-white space-y-2 animate-bounce">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-extrabold text-amber-300">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>{activeToast.title}</span>
            </div>
            <button onClick={() => setActiveToast(null)} className="text-rose-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-rose-100 font-medium">{activeToast.body}</p>

          {activeToast.imageUrl && (
            <div className="w-full h-24 rounded-xl overflow-hidden border border-rose-500/30">
              <img src={activeToast.imageUrl} alt="Sketch" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
