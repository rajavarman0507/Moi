"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "@/lib/firebase";
import { Heart, Mail, Lock, ArrowRight, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkCoupleAndRedirect = async (uid: string) => {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists() && userSnap.data()?.coupleId) {
      router.push("/");
    } else {
      router.push("/pair");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      await checkCoupleAndRedirect(userCred.user.uid);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Failed to sign in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const userCred = await signInWithPopup(auth, googleProvider);
      const uid = userCred.user.uid;

      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid,
          email: userCred.user.email,
          displayName: userCred.user.displayName || "",
          coupleId: null,
          createdAt: serverTimestamp(),
        });
      }

      await checkCoupleAndRedirect(uid);
    } catch (err: any) {
      console.error("Google sign in error:", err);
      setError(err.message || "Failed to sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-md moi-card p-8 md:p-10 space-y-8 relative overflow-hidden">
        {/* Glow Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-rose-600 via-wine-600 to-rose-400 flex items-center justify-center text-white mx-auto shadow-glow">
            <Heart className="w-7 h-7 fill-white text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>Welcome Back</span>
              <Sparkles className="w-5 h-5 text-amber-300 animate-spin" style={{ animationDuration: "6s" }} />
            </h1>
            <p className="text-sm text-rose-200/70 mt-1">Sign in to your private couple space</p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-rose-300/80 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-3.5 text-rose-400/60" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white font-medium placeholder-rose-300/40 focus:border-rose-400 focus:outline-none text-sm transition-all shadow-inner"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-rose-300/80 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-rose-400/60" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white font-medium placeholder-rose-300/40 focus:border-rose-400 focus:outline-none text-sm transition-all shadow-inner"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full moi-button-primary flex items-center justify-center space-x-2 py-3.5 font-semibold text-sm disabled:opacity-50"
          >
            <span>{loading ? "Signing in..." : "Sign In"}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-rose-900/40 w-full"></div>
          <span className="bg-[#210915] px-3 text-xs text-rose-300/60 font-medium uppercase tracking-wider absolute">
            Or
          </span>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full moi-button-secondary flex items-center justify-center space-x-3 py-3 text-sm font-medium"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <p className="text-center text-xs text-rose-300/70">
          Don't have an account yet?{" "}
          <Link href="/signup" className="font-semibold text-rose-400 hover:text-rose-300 underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
