"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  lastUpdatedMs: number;
  userId: string;
}

interface LocationContextType {
  isSharing: boolean;
  sharingStartedAt: string | null;
  toggleSharing: () => Promise<void>;
  partnerLocation: LocationData | null;
  partnerIsStale: boolean;
  myLocation: LocationData | null;
  error: string | null;
}

const LocationContext = createContext<LocationContextType>({
  isSharing: false,
  sharingStartedAt: null,
  toggleSharing: async () => {},
  partnerLocation: null,
  partnerIsStale: true,
  myLocation: null,
  error: null,
});

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user, couple } = useAuth();
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [sharingStartedAt, setSharingStartedAt] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<LocationData | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<LocationData | null>(null);
  const [partnerIsStale, setPartnerIsStale] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.uid;
  const coupleId = couple?.id;
  const partnerId = couple?.userIds.find((id) => id !== userId);

  // 1. Subscribe to Partner's Live Location from Firestore
  useEffect(() => {
    if (!coupleId || !partnerId) return;

    const partnerLocRef = doc(db, "couples", coupleId, "liveLocation", partnerId);
    const unsubscribe = onSnapshot(partnerLocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LocationData;
        const now = Date.now();
        const isStale = (now - (data.lastUpdatedMs || 0)) > 120000; // 2 minutes threshold

        setPartnerLocation(data);
        setPartnerIsStale(isStale);
      } else {
        setPartnerLocation(null);
        setPartnerIsStale(true);
      }
    });

    return () => unsubscribe();
  }, [coupleId, partnerId]);

  // Periodic Stale Check every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (partnerLocation) {
        const now = Date.now();
        const isStale = (now - (partnerLocation.lastUpdatedMs || 0)) > 120000;
        setPartnerIsStale(isStale);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [partnerLocation]);

  // 2. Manage Geolocation watchPosition when isSharing === true
  useEffect(() => {
    if (!isSharing || !coupleId || !userId) return;

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.");
      setIsSharing(false);
      return;
    }

    const myLocRef = doc(db, "couples", coupleId, "liveLocation", userId);

    const updateCoords = async (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const locData: LocationData = {
        lat: latitude,
        lng: longitude,
        accuracy,
        lastUpdatedMs: Date.now(),
        userId,
      };

      setMyLocation(locData);
      setError(null);

      try {
        await setDoc(myLocRef, {
          ...locData,
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("Error writing live location to Firestore:", err);
      }
    };

    const handleGeoError = (err: GeolocationPositionError) => {
      console.warn("Geolocation error:", err.message);
      setError(`Location error: ${err.message}`);
    };

    const watchId = navigator.geolocation.watchPosition(updateCoords, handleGeoError, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 30000,
    });

    const handleUnload = () => {
      deleteDoc(myLocRef).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("beforeunload", handleUnload);
      deleteDoc(myLocRef).catch(() => {});
    };
  }, [isSharing, coupleId, userId]);

  // 3. Toggle Sharing Action
  const toggleSharing = async () => {
    if (!isSharing) {
      setIsSharing(true);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSharingStartedAt(timeStr);
    } else {
      setIsSharing(false);
      setSharingStartedAt(null);
      setMyLocation(null);

      if (coupleId && userId) {
        const myLocRef = doc(db, "couples", coupleId, "liveLocation", userId);
        try {
          await deleteDoc(myLocRef);
        } catch (err) {
          console.error("Error deleting live location document:", err);
        }
      }
    }
  };

  return (
    <LocationContext.Provider
      value={{
        isSharing,
        sharingStartedAt,
        toggleSharing,
        partnerLocation,
        partnerIsStale,
        myLocation,
        error,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationSharing() {
  return useContext(LocationContext);
}

export function useLocation() {
  return useContext(LocationContext);
}
