"use client";

import React from "react";
import { Settings, Sparkles } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-rose-100 flex items-center justify-center text-plum-800 shadow-soft">
        <Settings className="w-8 h-8" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h1 className="text-2xl font-bold text-plum-900">App Settings</h1>
        <p className="text-xs text-plum-500">
          Manage profile details, couple anniversary date, notification preferences & PWA settings.
        </p>
      </div>
      <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-cream-100 border border-rose-100 text-xs font-semibold text-plum-700">
        <Sparkles className="w-4 h-4 text-plum-600" />
        <span>Coming soon in Phase 2</span>
      </div>
    </div>
  );
}
