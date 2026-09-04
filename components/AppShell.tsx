"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePartnerPresence } from "@/hooks/usePartnerPresence";
import { LocationProvider } from "@/context/LocationContext";
import LocationBanner from "@/components/LocationBanner";
import GlobalPresence from "@/components/GlobalPresence";
import NotificationListener from "@/components/NotificationListener";
import BugReportModal from "@/components/BugReportModal";
import IncomingCallOverlay from "@/components/IncomingCallOverlay";
import MusicMiniPlayer from "@/components/MusicMiniPlayer";
import OnboardingTour from "@/components/OnboardingTour";
import { useAuth } from "@/context/AuthContext";
import {
  Home,
  Palette,
  Image as ImageIcon,
  Gamepad2,
  Sparkles,
  Heart,
  Lock,
  Navigation,
  Settings,
  LogOut,
  User as UserIcon,
  MessageCircle,
  PhoneCall,
  Radio,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { name: "Home", href: "/", icon: Home },
  { name: "Chat", href: "/chat", icon: MessageCircle },
  { name: "Call", href: "/call", icon: PhoneCall },
  { name: "Music", href: "/music", icon: Radio },
  { name: "Doodle", href: "/doodle", icon: Palette },
  { name: "Moments", href: "/moments", icon: ImageIcon },
  { name: "Games", href: "/games", icon: Gamepad2 },
  { name: "Cards", href: "/cards", icon: Heart },
  { name: "Mood", href: "/mood", icon: Sparkles },
  { name: "Private Hub", href: "/hub", icon: Lock },
  { name: "Location", href: "/location", icon: Navigation },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, logout } = useAuth();
  const { online: partnerOnline, currentPath: partnerPath, partnerName } = usePartnerPresence();

  // Hide AppShell navigation on Auth & Pairing pages
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/pair";

  if (isAuthPage) {
    return <main className="min-h-screen relative z-10">{children}</main>;
  }

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const isPartnerOnItem = (itemHref: string) => {
    if (!partnerOnline) return false;
    if (itemHref === "/") return partnerPath === "/";
    return partnerPath.startsWith(itemHref);
  };

  return (
    <LocationProvider>
      <div className="min-h-screen flex flex-col md:flex-row relative z-10">
        {/* Global Presence Tracker Across All Pages */}
        <GlobalPresence />

        {/* Firestore-Triggered Notification Listener & Toast Overlay */}
        <NotificationListener />

        {/* First-Login Onboarding Tour */}
        <OnboardingTour />

        {/* Floating Bug Report Modal */}
        <BugReportModal />

        {/* Global WebRTC Incoming Call Overlay */}
        <IncomingCallOverlay />

        {/* Global Persistent Shared Music Mini-Player */}
        <MusicMiniPlayer />

        {/* Desktop Left Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#16060E]/85 backdrop-blur-xl border-r border-rose-900/30 p-6 z-20 justify-between shadow-2xl">
          <div className="space-y-6">
            {/* Logo & Brand Header */}
            <div className="flex items-center space-x-3 px-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-wine-600 to-rose-400 flex items-center justify-center text-white font-bold text-xl shadow-glow">
                <Heart className="w-5 h-5 fill-white text-white" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                  <span>Moi</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-normal">♥</span>
                </h1>
                <p className="text-xs text-rose-300/70 font-medium">Private Couple Space</p>
              </div>
            </div>

            {/* Navigation Items */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const partnerHere = isPartnerOnItem(item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-rose-900/60 to-wine-800/80 text-white border border-rose-500/30 shadow-glow"
                        : "text-rose-200/70 hover:bg-rose-950/40 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-4 h-4 ${isActive ? "text-rose-400" : "text-rose-300/60"}`} />
                      <span>{item.name}</span>
                    </div>

                    {/* Partner Blinking Green Heart Badge */}
                    {partnerHere && (
                      <span
                        className="text-xs animate-bounce"
                        title={`${partnerName} is viewing this page`}
                      >
                        💚
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Info & Logout */}
          <div className="pt-3 border-t border-rose-900/30 space-y-2">
            {userProfile && (
              <div className="flex items-center space-x-3 px-2 py-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-wine-700 text-white flex items-center justify-center font-semibold text-xs shadow-sm border border-rose-400/30 overflow-hidden">
                  {userProfile.photoUrl ? (
                    <img src={userProfile.photoUrl} alt={userProfile.displayName || "User"} className="w-full h-full object-cover" />
                  ) : (
                    <span>{userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <UserIcon className="w-3.5 h-3.5" />}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-rose-100">
                    {userProfile.displayName || userProfile.email.split("@")[0]}
                  </p>
                  <p className="text-[10px] text-rose-300/60 truncate">{userProfile.email}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-2xl text-xs font-medium text-rose-400 hover:bg-rose-950/50 hover:text-rose-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
          {/* Global Location Sharing Persistent Banner */}
          <LocationBanner />

          {/* Mobile Header */}
          <header className="md:hidden flex items-center justify-between px-6 py-4 bg-[#16060E]/90 backdrop-blur-xl border-b border-rose-900/30 sticky top-0 z-20">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-wine-700 flex items-center justify-center text-white font-bold text-base shadow-glow">
                <Heart className="w-4 h-4 fill-white text-white" />
              </div>
              <span className="text-lg font-bold text-white">Moi</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-rose-400 hover:bg-rose-950/50 hover:text-white"
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-3 sm:p-6 md:p-10 pb-28 md:pb-10 max-w-6xl w-full mx-auto overflow-x-hidden">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#16060E]/95 backdrop-blur-2xl border-t border-rose-900/30 px-1.5 py-1.5 flex justify-around z-30 shadow-2xl overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const partnerHere = isPartnerOnItem(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition-all relative shrink-0 ${
                  isActive ? "text-rose-400 font-semibold" : "text-rose-300/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] mt-0.5">{item.name}</span>
                {partnerHere && (
                  <span className="absolute -top-1 right-0.5 text-[9px] animate-bounce">
                    💚
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </LocationProvider>
  );
}
