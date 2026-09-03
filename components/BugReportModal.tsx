"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Bug, X, Send, CheckCircle2, Image as ImageIcon } from "lucide-react";

export default function BugReportModal() {
  const pathname = usePathname();
  const { user, couple, userProfile } = useAuth();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Do not render on auth pages
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/pair";
  if (isAuthPage || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      const reportId = `report_${Date.now()}`;
      let uploadedScreenshotUrl = "";

      if (screenshotFile) {
        const fileRef = storageRef(
          storage,
          `bugReports/${user.uid}/${reportId}_${screenshotFile.name}`
        );
        await uploadBytes(fileRef, screenshotFile);
        uploadedScreenshotUrl = await getDownloadURL(fileRef);
      }

      const reportDocRef = doc(db, "bugReports", reportId);
      await setDoc(reportDocRef, {
        reportId,
        userId: user.uid,
        userEmail: userProfile?.email || user.email || "anonymous",
        coupleId: couple?.id || "unpaired",
        pageRoute: pathname,
        description: description.trim(),
        screenshotUrl: uploadedScreenshotUrl,
        createdAt: serverTimestamp(),
      });

      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setIsOpen(false);
        setDescription("");
        setScreenshotFile(null);
      }, 2000);
    } catch (err) {
      console.error("Error submitting bug report:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-6 z-40 px-3.5 py-2.5 rounded-2xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center space-x-2 shadow-2xl backdrop-blur-md transition-all hover:scale-105"
        title="Report a bug or suggestion"
      >
        <Bug className="w-4 h-4 text-rose-400 animate-pulse" />
        <span>Report Bug</span>
      </button>

      {/* Bug Report Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-[#12040A]/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="moi-card p-6 md:p-8 max-w-md w-full bg-gradient-to-br from-[#270B19]/95 via-[#3B1124]/95 to-[#1C0512]/95 border border-rose-500/40 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-300">
                  <Bug className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Report an Issue</h3>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="text-rose-300/60 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isSubmitted ? (
              <div className="p-6 text-center space-y-2 text-emerald-300 animate-bounce">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Feedback Received!</h4>
                <p className="text-xs text-emerald-200/80">
                  Thank you! Your bug report has been submitted to the admin team.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block mb-1">
                    Current Page
                  </label>
                  <input
                    type="text"
                    disabled
                    value={pathname}
                    className="w-full px-3 py-2 rounded-xl bg-wine-950/60 border border-rose-500/20 text-rose-200/70 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block mb-1">
                    What Happened?
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue or feedback in detail..."
                    className="w-full p-3 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-xs placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none leading-relaxed"
                    style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block mb-1">
                    Optional Screenshot
                  </label>
                  <div className="flex items-center space-x-2 text-xs text-rose-300">
                    <ImageIcon className="w-4 h-4 text-amber-300" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setScreenshotFile(e.target.files[0]);
                        }
                      }}
                      className="text-xs text-rose-200/80 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-rose-500/20 file:text-rose-300 file:font-semibold cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300/70 hover:text-white"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="moi-button-primary px-5 py-2.5 text-xs font-extrabold flex items-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? "Sending..." : "Submit Report"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
