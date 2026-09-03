"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Heart, Sparkles, Gamepad2, Lock, ArrowRight, Check } from "lucide-react";

interface Step {
  title: string;
  description: string;
  icon: React.ElementType;
}

const TOUR_STEPS: Step[] = [
  {
    title: "Welcome to Moi! ♥",
    description: "Your private space built strictly for two. Track your love journey, light your couple candle, and draw together on the shared board!",
    icon: Heart,
  },
  {
    title: "150+ Connection Cards 🃏",
    description: "Explore 5 conversation categories (Deep Talk, Fun, Future Dreams, Memory Lane, Spicy) and mark questions answered together.",
    icon: Sparkles,
  },
  {
    title: "Couple Games Hub 🎮",
    description: "Play 6 interactive real-time multiplayer games including Sketch & Guess, Truth or Dare, Compatibility Quiz, and Tic Tac Toe!",
    icon: Gamepad2,
  },
  {
    title: "Private Hub & Encryption 🔒",
    description: "Write AES-GCM encrypted love letters, record memories on your timeline, and share live location safely with strict PIN protection.",
    icon: Lock,
  },
];

export default function OnboardingTour() {
  const pathname = usePathname();
  const { user, userProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!user || !userProfile) return;

    // Do not show on auth pages
    const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/pair";
    if (isAuthPage) return;

    const isCompletedOnAccount = Boolean(userProfile.onboardingCompleted);
    const isCompletedLocal = localStorage.getItem(`moi_tour_${user.uid}`) === "true";

    if (!isCompletedOnAccount && !isCompletedLocal) {
      setIsVisible(true);
    }
  }, [user, userProfile, pathname]);

  const handleNextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      finishTour();
    }
  };

  const finishTour = async () => {
    setIsVisible(false);
    if (!user) return;

    localStorage.setItem(`moi_tour_${user.uid}`, "true");

    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        onboardingCompleted: true,
      });
    } catch (err) {
      console.error("Error saving onboarding completion:", err);
    }
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="moi-card p-6 md:p-8 max-w-md w-full bg-gradient-to-br from-[#2F0B1E]/95 via-[#44112B]/95 to-[#230615]/95 border border-rose-500/40 text-center space-y-6 shadow-2xl relative animate-float-up">
        {/* Step Progress Pills */}
        <div className="flex items-center justify-center space-x-2">
          {TOUR_STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${
                idx === currentStep
                  ? "w-8 bg-rose-400 shadow-glow"
                  : idx < currentStep
                  ? "w-2 bg-emerald-400"
                  : "w-2 bg-rose-900/50"
              }`}
            />
          ))}
        </div>

        {/* Step Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-600 to-wine-700 mx-auto flex items-center justify-center text-white shadow-glow">
          <StepIcon className="w-8 h-8" />
        </div>

        {/* Step Content */}
        <div className="space-y-2">
          <h3 className="text-xl font-extrabold text-white">{step.title}</h3>
          <p className="text-xs md:text-sm text-rose-200/80 leading-relaxed max-w-sm mx-auto">
            {step.description}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={finishTour}
            className="text-xs font-semibold text-rose-300/60 hover:text-white transition-colors"
          >
            Skip Tour
          </button>

          <button
            onClick={handleNextStep}
            className="moi-button-primary px-6 py-2.5 text-xs font-extrabold flex items-center space-x-1.5"
          >
            <span>{currentStep === TOUR_STEPS.length - 1 ? "Get Started" : "Next Step"}</span>
            {currentStep === TOUR_STEPS.length - 1 ? (
              <Check className="w-4 h-4" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
