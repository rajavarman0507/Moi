"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  coupleId?: string | null;
  theme?: "light" | "dark" | "system";
  notificationSettings?: {
    remindDailyPrompt?: boolean;
    alertPartnerOnline?: boolean;
    notifyMoments?: boolean;
  };
  locationSharingEnabled?: boolean;
  onboardingCompleted?: boolean;
  createdAt?: any;
}

export interface Couple {
  id: string;
  userIds: string[];
  togetherSince: string; // ISO date string e.g. "2024-02-14"
  archived?: boolean;
  createdAt?: any;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  couple: Couple | null;
  partnerProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshCouple: () => Promise<void>;
  unpairCouple: (coupleId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  couple: null,
  partnerProfile: null,
  loading: true,
  logout: async () => {},
  refreshCouple: async () => {},
  unpairCouple: async () => {},
});

export async function unpairCouple(coupleId: string) {
  try {
    const coupleRef = doc(db, "couples", coupleId);
    const coupleSnap = await getDoc(coupleRef);

    if (coupleSnap.exists()) {
      const coupleData = coupleSnap.data();
      const userIds: string[] = coupleData.userIds || [];

      // 1. Archive couple document (preserves historical data for safety/recovery)
      await setDoc(coupleRef, { archived: true, archivedAt: serverTimestamp() }, { merge: true });

      // 2. Clear coupleId on both partner user documents
      for (const uid of userIds) {
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, { coupleId: null }, { merge: true });
      }
    }
  } catch (err) {
    console.error("Error unpairing couple:", err);
    throw err;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserProfile(null);
        setCouple(null);
        setPartnerProfile(null);
        setLoading(false);
        return;
      }

      // Subscribe to User Document
      const userRef = doc(db, "users", firebaseUser.uid);
      const unsubscribeUser = onSnapshot(
        userRef,
        async (snapshot) => {
          if (snapshot.exists()) {
            const profileData = snapshot.data() as UserProfile;
            setUserProfile(profileData);

            if (profileData.coupleId) {
              // Subscribe to Couple Document
              const coupleRef = doc(db, "couples", profileData.coupleId);
              onSnapshot(
                coupleRef,
                async (coupleSnap) => {
                  if (coupleSnap.exists()) {
                    const coupleData = { id: coupleSnap.id, ...coupleSnap.data() } as Couple;
                    if (coupleData.archived === true) {
                      // Passive partner live unpair reaction: clear couple state immediately
                      setCouple(null);
                      setPartnerProfile(null);
                    } else {
                      setCouple(coupleData);

                      // Find partner ID and subscribe to partner profile in real-time
                      const partnerId = coupleData.userIds.find((id) => id !== firebaseUser.uid);
                      if (partnerId) {
                        onSnapshot(doc(db, "users", partnerId), (partnerSnap) => {
                          if (partnerSnap.exists()) {
                            setPartnerProfile(partnerSnap.data() as UserProfile);
                          }
                        });
                      }
                    }
                  } else {
                    setCouple(null);
                  }
                  setLoading(false);
                },
                (err) => {
                  console.error("Couple snapshot error:", err);
                  setLoading(false);
                }
              );
            } else {
              setCouple(null);
              setPartnerProfile(null);
              setLoading(false);
            }
          } else {
            setUserProfile(null);
            setCouple(null);
            setLoading(false);
          }
        },
        (error) => {
          console.error("Firestore user snapshot error:", error);
          setLoading(false);
        }
      );

      return () => unsubscribeUser();
    });

    return () => unsubscribeAuth();
  }, []);

  const logout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setUserProfile(null);
    setCouple(null);
    setPartnerProfile(null);
  };

  const refreshCouple = async () => {
    if (!userProfile?.coupleId) return;
    const coupleSnap = await getDoc(doc(db, "couples", userProfile.coupleId));
    if (coupleSnap.exists()) {
      setCouple({ id: coupleSnap.id, ...coupleSnap.data() } as Couple);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        couple,
        partnerProfile,
        loading,
        logout,
        refreshCouple,
        unpairCouple,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
