"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  // 1. Initial theme loading from localStorage or userProfile
  useEffect(() => {
    const savedTheme = (userProfile?.theme as ThemeMode) || (localStorage.getItem("moi_theme") as ThemeMode) || "dark";
    setThemeState(savedTheme);
  }, [userProfile]);

  // 2. Apply theme class to document element and listen for system color scheme changes
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      root.classList.remove("light", "dark");
      let activeTheme = theme;
      if (theme === "system") {
        activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      root.classList.add(activeTheme);
    };

    applyTheme();
    localStorage.setItem("moi_theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  // 3. Set theme state & persist to Firestore
  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    if (user?.uid) {
      const userDocRef = doc(db, "users", user.uid);
      setDoc(userDocRef, { theme: mode }, { merge: true }).catch((err) =>
        console.error("Error saving theme to Firestore:", err)
      );
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
