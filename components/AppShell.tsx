"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Gamepad2,
  Sparkles,
  Heart,
  Lock,
  Settings,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { name: "Home", href: "/", icon: Home },
  { name: "Games", href: "/games", icon: Gamepad2 },
  { name: "Cards", href: "/cards", icon: Heart },
  { name: "Mood", href: "/mood", icon: Sparkles },
  { name: "Private Hub", href: "/hub", icon: Lock },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, couple, logout, loading } = useAuth();

  // Hide AppShell on Auth & Pairing pages
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/pair";

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream-50 text-plum-900">
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white/80 backdrop-blur-md border-r border-rose-100 p-6 z-20 justify-between shadow-soft">
        <div className="space-y-8">
          {/* Logo & Brand Header */}
          <div className="flex items-center space-x-3 px-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-plum-800 to-plum-600 flex items-center justify-center text-cream-50 font-bold text-xl shadow-md">
              M
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-plum-900">Moi</h1>
              <p className="text-xs text-plum-500 font-medium">Private Couple Space</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-rose-100/80 text-plum-800 shadow-sm"
                      : "text-plum-700 hover:bg-rose-50 hover:text-plum-900"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-plum-800" : "text-plum-500"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info & Logout */}
        <div className="pt-4 border-t border-rose-100 space-y-3">
          {userProfile && (
            <div className="flex items-center space-x-3 px-2 py-1">
              <div className="w-9 h-9 rounded-full bg-rose-200 text-plum-800 flex items-center justify-center font-semibold text-sm">
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-plum-900">
                  {userProfile.displayName || userProfile.email.split("@")[0]}
                </p>
                <p className="text-xs text-plum-500 truncate">{userProfile.email}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-sm font-medium text-rose-400 hover:bg-rose-50 hover:text-plum-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-rose-100 sticky top-0 z-20">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-plum-800 to-plum-600 flex items-center justify-center text-cream-50 font-bold text-base">
              M
            </div>
            <span className="text-lg font-bold text-plum-900">Moi</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-rose-400 hover:bg-rose-50 hover:text-plum-800"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 md:p-10 pb-24 md:pb-10 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-rose-100 px-3 py-2 flex justify-around z-30 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
                isActive ? "text-plum-800 font-semibold" : "text-plum-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
