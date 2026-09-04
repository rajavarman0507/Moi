"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLocation } from "@/context/LocationContext";
import { db, storage, googleProvider } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, deleteUser } from "firebase/auth";
import { derivePbkdf2Hash, reencryptAllLettersAtomic, decryptLetter } from "@/lib/cryptoUtils";
import {
  User,
  Heart,
  Bell,
  Sun,
  Moon,
  Monitor,
  Lock,
  MapPin,
  Download,
  Trash2,
  Unlink,
  CheckCircle2,
  AlertTriangle,
  Upload,
  KeyRound,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  X,
  Calendar,
} from "lucide-react";

type ActiveTab = "profile" | "relationship" | "notifications" | "appearance" | "privacy" | "export";

export default function SettingsPage() {
  const router = useRouter();
  const { user, userProfile, couple, partnerProfile, loading, logout, unpairCouple } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isSharing, toggleSharing } = useLocation();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");

  // --- 1. Profile Section State ---
  const [displayName, setDisplayName] = useState<string>("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // --- 2. Relationship Section State ---
  const [togetherDate, setTogetherDate] = useState<string>("");
  const [showAnniversaryModal, setShowAnniversaryModal] = useState<boolean>(false);
  const [isSavingAnniversary, setIsSavingAnniversary] = useState<boolean>(false);

  const [showUnpairModal, setShowUnpairModal] = useState<boolean>(false);
  const [unpairPhrase, setUnpairPhrase] = useState<string>("");
  const [isUnpairing, setIsUnpairing] = useState<boolean>(false);

  // --- 3. Notification Preferences State ---
  const [remindDailyPrompt, setRemindDailyPrompt] = useState<boolean>(true);
  const [alertPartnerOnline, setAlertPartnerOnline] = useState<boolean>(true);
  const [notifyMoments, setNotifyMoments] = useState<boolean>(true);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  // --- 4. Privacy & Security: PIN Change State ---
  const [oldPin, setOldPin] = useState<string>("");
  const [newPin, setNewPin] = useState<string>("");
  const [confirmNewPin, setConfirmNewPin] = useState<string>("");
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [pinProgress, setPinProgress] = useState<{ current: number; total: number } | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  // --- Privacy & Security: Account Deletion State ---
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>("");
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- 5. Data Export State ---
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const coupleId = couple?.id;
  const myName = userProfile?.displayName || userProfile?.email?.split("@")[0] || "You";
  const partnerName = partnerProfile?.displayName || partnerProfile?.email?.split("@")[0] || "Partner";

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || "");
      setPhotoPreview(userProfile.photoUrl || null);
      if (userProfile.notificationSettings) {
        setRemindDailyPrompt(userProfile.notificationSettings.remindDailyPrompt ?? true);
        setAlertPartnerOnline(userProfile.notificationSettings.alertPartnerOnline ?? true);
        setNotifyMoments(userProfile.notificationSettings.notifyMoments ?? true);
      }
    }
  }, [userProfile]);

  useEffect(() => {
    if (couple) {
      setTogetherDate(couple.togetherSince || "");
    }
  }, [couple]);

  // Helper to compress avatar image file to lightweight Base64 Data URL for instant resilient fallback
  const compressAvatarFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 320;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setIsSavingProfile(true);
    setProfileMsg(null);

    try {
      let photoUrl = userProfile?.photoUrl || "";

      if (profilePhoto) {
        // Compress avatar file first to guarantee ultra-fast Data URL fallback
        const dataUrl = await compressAvatarFile(profilePhoto);
        photoUrl = dataUrl;

        // Try uploading to Cloud Storage with a 3.5-second timeout safeguard
        try {
          const storageRef = ref(storage, `users/${user.uid}/profilePhoto`);
          const uploadPromise = uploadBytes(storageRef, profilePhoto).then(() =>
            getDownloadURL(storageRef)
          );
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Storage upload timeout")), 3500)
          );

          const cloudStorageUrl = await Promise.race([uploadPromise, timeoutPromise]);
          if (cloudStorageUrl) {
            photoUrl = cloudStorageUrl;
          }
        } catch (storageErr) {
          console.warn("Cloud Storage upload fallback to compressed Data URL:", storageErr);
        }
      }

      // Save user profile document to Firestore
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { displayName: displayName.trim(), photoUrl }, { merge: true });

      setPhotoPreview(photoUrl);
      setProfilePhoto(null);
      setProfileMsg("Profile updated successfully!");
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setProfileMsg(err.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Photo Choice
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProfilePhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Handle Anniversary Date Update
  const handleConfirmSaveAnniversary = async () => {
    if (!coupleId || !togetherDate) return;
    setIsSavingAnniversary(true);

    try {
      const coupleRef = doc(db, "couples", coupleId);
      await setDoc(coupleRef, { togetherSince: togetherDate }, { merge: true });
      setShowAnniversaryModal(false);
    } catch (err) {
      console.error("Error updating anniversary date:", err);
    } finally {
      setIsSavingAnniversary(false);
    }
  };

  // Handle Unpair Execution
  const handleConfirmUnpair = async () => {
    if (!coupleId || unpairPhrase.trim().toUpperCase() !== "UNPAIR") return;
    setIsUnpairing(true);

    try {
      await unpairCouple(coupleId);
      await logout();
      router.push("/pair");
    } catch (err) {
      console.error("Error unpairing couple:", err);
    } finally {
      setIsUnpairing(false);
      setShowUnpairModal(false);
    }
  };

  // Handle Notification Toggle Save
  const handleToggleNotif = async (field: "remindDailyPrompt" | "alertPartnerOnline" | "notifyMoments", val: boolean) => {
    if (!user?.uid) return;
    const newSettings = {
      remindDailyPrompt: field === "remindDailyPrompt" ? val : remindDailyPrompt,
      alertPartnerOnline: field === "alertPartnerOnline" ? val : alertPartnerOnline,
      notifyMoments: field === "notifyMoments" ? val : notifyMoments,
    };

    if (field === "remindDailyPrompt") setRemindDailyPrompt(val);
    if (field === "alertPartnerOnline") setAlertPartnerOnline(val);
    if (field === "notifyMoments") setNotifyMoments(val);

    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { notificationSettings: newSettings }, { merge: true });
      setNotifMsg("Preferences saved!");
      setTimeout(() => setNotifMsg(null), 2000);
    } catch (err) {
      console.error("Error saving notification settings:", err);
    }
  };

  // Handle Atomic PIN Change & Letter Re-Encryption
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId) return;

    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setPinError("New PIN must be 4 to 6 numeric digits.");
      return;
    }

    if (newPin !== confirmNewPin) {
      setPinError("New PINs do not match.");
      return;
    }

    setIsChangingPin(true);
    setPinError(null);
    setPinSuccess(null);
    setPinProgress({ current: 0, total: 100 });

    try {
      await reencryptAllLettersAtomic(coupleId, oldPin, newPin, (current, total) => {
        setPinProgress({ current, total });
      });

      setPinSuccess("Shared PIN changed & all love letters safely re-encrypted!");
      setOldPin("");
      setNewPin("");
      setConfirmNewPin("");
    } catch (err: any) {
      console.error("PIN change error:", err);
      setPinError(err.message || "Failed to change PIN. Old PIN remains active and untouched.");
    } finally {
      setIsChangingPin(false);
      setPinProgress(null);
    }
  };

  // Handle Account Deletion
  const handleConfirmDeleteAccount = async () => {
    if (!user) return;
    setIsDeletingAccount(true);
    setDeleteError(null);

    try {
      const isGoogleUser = user.providerData[0]?.providerId === "google.com";

      // 1. Re-authenticate
      if (isGoogleUser) {
        await reauthenticateWithPopup(user, googleProvider);
      } else {
        if (!deletePassword) {
          setDeleteError("Password is required to re-authenticate account deletion.");
          setIsDeletingAccount(false);
          return;
        }
        const credential = EmailAuthProvider.credential(user.email || "", deletePassword);
        await reauthenticateWithCredential(user, credential);
      }

      // 2. Unpair couple first if currently paired
      if (coupleId) {
        await unpairCouple(coupleId);
      }

      // 3. Delete Profile Photo from Storage if exists
      try {
        const photoRef = ref(storage, `users/${user.uid}/profilePhoto`);
        await deleteObject(photoRef);
      } catch (e) {}

      // 4. Delete Firestore User Document
      await deleteDoc(doc(db, "users", user.uid));

      // 5. Delete Firebase Auth Account
      await deleteUser(user);

      router.push("/signup");
    } catch (err: any) {
      console.error("Account deletion error:", err);
      setDeleteError(err.message || "Failed to delete account. Please re-authenticate and try again.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Handle Data Export (Download JSON)
  const handleDownloadData = async () => {
    if (!user?.uid || !coupleId) return;
    setIsExporting(true);

    try {
      const exportData: Record<string, any> = {
        exportTimestamp: new Date().toISOString(),
        profile: userProfile,
        couple: couple,
      };

      // Fetch Mood History
      const moodSnap = await getDocs(collection(db, "couples", coupleId, "moods"));
      exportData.moods = moodSnap.docs.map((d) => d.data());

      // Fetch Answered Cards
      const cardsSnap = await getDocs(collection(db, "couples", coupleId, "answeredCards"));
      exportData.answeredCards = cardsSnap.docs.map((d) => d.data());

      // Fetch Memory Timeline
      const memSnap = await getDocs(collection(db, "couples", coupleId, "privateHub", "memories", "items"));
      exportData.memories = memSnap.docs.map((d) => d.data());

      // Generate Download JSON Blob
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moi-user-data-${user.uid.slice(0, 6)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Data export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-rose-300">
        <p className="font-medium animate-pulse">Loading Settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative z-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <span>App Settings</span>
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
          </h1>
          <p className="text-xs text-rose-200/70 mt-1">
            Manage your profile, couple anniversary, security, theme, & data privacy.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto scrollbar-none p-1.5 bg-wine-950/80 rounded-2xl border border-rose-500/20 gap-1.5 sm:flex-wrap">
        <button
          onClick={() => setActiveTab("profile")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "profile" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Profile</span>
        </button>

        <button
          onClick={() => setActiveTab("relationship")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "relationship" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          <span>Couple</span>
        </button>

        <button
          onClick={() => setActiveTab("notifications")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "notifications" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Alerts</span>
        </button>

        <button
          onClick={() => setActiveTab("appearance")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "appearance" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>Theme</span>
        </button>

        <button
          onClick={() => setActiveTab("privacy")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "privacy" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Security</span>
        </button>

        <button
          onClick={() => setActiveTab("export")}
          className={`shrink-0 sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "export" ? "bg-rose-600 text-white shadow-glow" : "text-rose-300/70 hover:text-white"
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>

      {/* --- 1. PROFILE SECTION --- */}
      {activeTab === "profile" && (
        <div className="moi-card p-4 sm:p-8 bg-wine-950/90 border border-rose-500/30 space-y-6 shadow-2xl overflow-hidden">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <User className="w-6 h-6 text-rose-400 shrink-0" />
            <h2 className="text-lg font-bold text-white">Your Account Profile</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Profile Picture Upload & Preview */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 max-w-full overflow-hidden">
              <div className="relative w-20 h-20 rounded-full border-2 border-rose-500/40 overflow-hidden bg-wine-900/80 flex items-center justify-center text-rose-200 text-xl font-bold shadow-inner shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt={myName} className="w-full h-full object-cover" />
                ) : (
                  <span>{myName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className="space-y-2 max-w-full overflow-hidden">
                <label className="px-4 py-2.5 rounded-xl bg-rose-900/60 hover:bg-rose-800 border border-rose-500/30 text-xs font-bold text-rose-200 inline-flex items-center space-x-2 cursor-pointer transition-colors max-w-full">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Choose New Avatar Photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                </label>
                <p className="text-[11px] text-rose-200/60 break-all max-w-full">
                  Uploads to Cloud Storage `users/{user.uid}/profilePhoto`.
                </p>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-rose-300 uppercase tracking-wider">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 rounded-2xl border border-rose-500/30 text-sm placeholder:text-rose-400/40 focus:border-rose-400 focus:outline-none"
              />
            </div>

            {profileMsg && <p className="text-xs font-bold text-emerald-300 animate-pulse">{profileMsg}</p>}

            <button
              type="submit"
              disabled={isSavingProfile}
              className="moi-button-primary px-6 py-3 text-xs font-extrabold inline-flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSavingProfile ? "Saving..." : "Save Profile Changes"}</span>
            </button>
          </form>

          {/* Read-Only Partner Preview */}
          <div className="pt-6 border-t border-rose-900/40 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300/80">Paired Partner Confirmation</h3>
            <div className="p-4 rounded-2xl bg-wine-900/40 border border-rose-500/20 flex items-center space-x-4 max-w-full overflow-hidden">
              <div className="w-12 h-12 rounded-full border border-rose-400/40 overflow-hidden bg-rose-950 flex items-center justify-center text-rose-200 font-bold text-sm shrink-0">
                {partnerProfile?.photoUrl ? (
                  <img src={partnerProfile.photoUrl} alt={partnerName} className="w-full h-full object-cover" />
                ) : (
                  <span>{partnerName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white truncate">{partnerName}</h4>
                <p className="text-xs text-rose-200/60 truncate">{partnerProfile?.email || "Paired Partner"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- 2. RELATIONSHIP SECTION --- */}
      {activeTab === "relationship" && (
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-6 shadow-2xl">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <Heart className="w-6 h-6 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Relationship & Anniversary</h2>
          </div>

          {/* Edit Anniversary Date */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-amber-300" />
                <span>Together Since Anniversary Date</span>
              </label>
              <input
                type="date"
                value={togetherDate}
                onChange={(e) => setTogetherDate(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-[#1B0710] border border-rose-500/30 text-white text-sm focus:border-rose-400 focus:outline-none"
                style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
              />
            </div>

            <button
              onClick={() => setShowAnniversaryModal(true)}
              className="moi-button-primary px-6 py-2.5 text-xs font-extrabold"
            >
              Update Anniversary Date
            </button>
          </div>

          {/* Unpair Section */}
          <div className="pt-8 border-t border-rose-900/40 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-400 flex items-center space-x-2">
                <Unlink className="w-4 h-4" />
                <span>Dissolve Relationship Pairing (Unpair)</span>
              </h3>
              <p className="text-xs text-rose-200/70">
                Unpairing archives your shared couple space (`couples/{coupleId}`) and redirects both of you to `/pair`. Historical data is archived safely and not hard-deleted.
              </p>
            </div>

            <button
              onClick={() => setShowUnpairModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-xs font-bold text-rose-300 flex items-center space-x-2 transition-colors"
            >
              <Unlink className="w-4 h-4" />
              <span>Unpair Account</span>
            </button>
          </div>

          {/* Anniversary Confirmation Modal */}
          {showAnniversaryModal && (
            <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="moi-card p-6 max-w-sm w-full bg-gradient-to-br from-[#2F0B1E] to-[#1C0512] border border-rose-500/40 space-y-4 text-center shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 mx-auto flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Update Anniversary Date?</h4>
                  <p className="text-xs text-rose-200/70">
                    This changes the "Together for X Days" live counter for **both you and {partnerName}**.
                  </p>
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button onClick={() => setShowAnniversaryModal(false)} className="px-4 py-2 text-xs font-bold text-rose-300/70 hover:text-white">Cancel</button>
                  <button onClick={handleConfirmSaveAnniversary} disabled={isSavingAnniversary} className="moi-button-primary px-5 py-2 text-xs font-extrabold">
                    {isSavingAnniversary ? "Updating..." : "Yes, Update Date"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Unpair Confirmation Modal */}
          {showUnpairModal && (
            <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="moi-card p-6 max-w-md w-full bg-gradient-to-br from-[#2F0B1E] to-[#1C0512] border border-rose-500/40 space-y-4 text-center shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                  <Unlink className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Dissolve Pairing with {partnerName}?</h4>
                  <p className="text-xs text-rose-200/70">
                    This will archive your shared couple space and return both partners to the pairing page. Type <span className="font-extrabold text-white font-mono">UNPAIR</span> to confirm.
                  </p>
                </div>
                <input
                  type="text"
                  value={unpairPhrase}
                  onChange={(e) => setUnpairPhrase(e.target.value)}
                  placeholder="Type UNPAIR to confirm"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#1B0710] border border-rose-500/40 text-center font-mono font-bold text-sm text-white focus:outline-none"
                  style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                />
                <div className="flex justify-end space-x-3 pt-2">
                  <button onClick={() => setShowUnpairModal(false)} className="px-4 py-2 text-xs font-bold text-rose-300/70 hover:text-white">Cancel</button>
                  <button
                    onClick={handleConfirmUnpair}
                    disabled={isUnpairing || unpairPhrase.trim().toUpperCase() !== "UNPAIR"}
                    className="moi-button-primary px-5 py-2 text-xs font-extrabold disabled:opacity-50"
                  >
                    {isUnpairing ? "Unpairing..." : "Confirm Unpair"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- 3. NOTIFICATIONS SECTION --- */}
      {activeTab === "notifications" && (
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-6 shadow-2xl">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <Bell className="w-6 h-6 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Notification Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-wine-900/40 border border-rose-500/20">
              <div>
                <h4 className="text-sm font-bold text-white">Daily Prompt Reminders</h4>
                <p className="text-xs text-rose-200/60">Receive reminders to answer the Daily Couple Joy prompt.</p>
              </div>
              <input
                type="checkbox"
                checked={remindDailyPrompt}
                onChange={(e) => handleToggleNotif("remindDailyPrompt", e.target.checked)}
                className="w-5 h-5 accent-rose-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-wine-900/40 border border-rose-500/20">
              <div>
                <h4 className="text-sm font-bold text-white">Partner Online Alerts</h4>
                <p className="text-xs text-rose-200/60">Get notified when {partnerName} opens the app.</p>
              </div>
              <input
                type="checkbox"
                checked={alertPartnerOnline}
                onChange={(e) => handleToggleNotif("alertPartnerOnline", e.target.checked)}
                className="w-5 h-5 accent-rose-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-wine-900/40 border border-rose-500/20">
              <div>
                <h4 className="text-sm font-bold text-white">Doodle & Moment Updates</h4>
                <p className="text-xs text-rose-200/60">Get alerts when new doodles or thoughts are posted.</p>
              </div>
              <input
                type="checkbox"
                checked={notifyMoments}
                onChange={(e) => handleToggleNotif("notifyMoments", e.target.checked)}
                className="w-5 h-5 accent-rose-500 cursor-pointer"
              />
            </div>

            {notifMsg && <p className="text-xs font-bold text-emerald-300 animate-pulse">{notifMsg}</p>}
          </div>
        </div>
      )}

      {/* --- 4. APPEARANCE SECTION --- */}
      {activeTab === "appearance" && (
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-6 shadow-2xl">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <Sun className="w-6 h-6 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Theme & Appearance</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setTheme("dark")}
              className={`p-6 rounded-2xl border flex flex-col items-center space-y-3 transition-all ${
                theme === "dark"
                  ? "bg-rose-600/30 border-rose-400 text-white shadow-glow"
                  : "bg-wine-900/40 border-rose-500/20 text-rose-300/70 hover:text-white"
              }`}
            >
              <Moon className="w-8 h-8 text-rose-400" />
              <span className="text-xs font-bold">Dark Wine (Default)</span>
            </button>

            <button
              onClick={() => setTheme("light")}
              className={`p-6 rounded-2xl border flex flex-col items-center space-y-3 transition-all ${
                theme === "light"
                  ? "bg-rose-600/30 border-rose-400 text-white shadow-glow"
                  : "bg-wine-900/40 border-rose-500/20 text-rose-300/70 hover:text-white"
              }`}
            >
              <Sun className="w-8 h-8 text-amber-300" />
              <span className="text-xs font-bold">Soft Rose Light</span>
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`p-6 rounded-2xl border flex flex-col items-center space-y-3 transition-all ${
                theme === "system"
                  ? "bg-rose-600/30 border-rose-400 text-white shadow-glow"
                  : "bg-wine-900/40 border-rose-500/20 text-rose-300/70 hover:text-white"
              }`}
            >
              <Monitor className="w-8 h-8 text-blue-400" />
              <span className="text-xs font-bold">System Preference</span>
            </button>
          </div>
        </div>
      )}

      {/* --- 5. PRIVACY & SECURITY SECTION --- */}
      {activeTab === "privacy" && (
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-8 shadow-2xl">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <Lock className="w-6 h-6 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Privacy, Shared PIN, & Security</h2>
          </div>

          {/* Change Shared PIN Flow */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-amber-300" />
                <span>Change Shared Couple PIN & Re-Encrypt Letters</span>
              </h3>
              <p className="text-xs text-rose-200/70">
                Changing your PIN safely decrypts all existing love letters in memory with the old key, generates a new salt, and re-encrypts each letter with the new key in an atomic batch write.
              </p>
            </div>

            <form onSubmit={handleChangePin} className="space-y-4 max-w-md">
              <div>
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="Enter Current 4–6 Digit PIN"
                  className="w-full px-4 py-3 rounded-2xl border border-rose-500/30 text-xs placeholder:text-rose-400/40 focus:border-rose-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="New PIN"
                  className="w-full px-4 py-3 rounded-2xl border border-rose-500/30 text-xs placeholder:text-rose-400/40 focus:border-rose-400 focus:outline-none"
                />
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value)}
                  placeholder="Confirm New PIN"
                  className="w-full px-4 py-3 rounded-2xl border border-rose-500/30 text-xs placeholder:text-rose-400/40 focus:border-rose-400 focus:outline-none"
                />
              </div>

              {pinProgress && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-bold space-y-1">
                  <p>Re-encrypting love letters: {pinProgress.current} / {pinProgress.total} steps...</p>
                  <div className="w-full h-1.5 bg-amber-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${Math.min(100, (pinProgress.current / Math.max(1, pinProgress.total)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {pinError && <p className="text-xs font-bold text-rose-400">{pinError}</p>}
              {pinSuccess && <p className="text-xs font-bold text-emerald-300 animate-pulse">{pinSuccess}</p>}

              <button
                type="submit"
                disabled={isChangingPin}
                className="moi-button-primary px-6 py-3 text-xs font-extrabold inline-flex items-center space-x-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isChangingPin ? "Re-encrypting Letters..." : "Change PIN & Re-encrypt"}</span>
              </button>
            </form>
          </div>

          {/* Location Sharing Shortcut Toggle */}
          <div className="pt-6 border-t border-rose-900/40 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-rose-400" />
                <span>Live Location Sharing</span>
              </h4>
              <p className="text-xs text-rose-200/60">Share your live location with {partnerName} while active.</p>
            </div>
            <button
              onClick={toggleSharing}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isSharing ? "bg-emerald-600 text-white shadow-glow" : "bg-rose-950 border border-rose-500/30 text-rose-300"
              }`}
            >
              {isSharing ? "Sharing Active (ON)" : "Location Off"}
            </button>
          </div>

          {/* Account Deletion Flow */}
          <div className="pt-6 border-t border-rose-900/40 space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-400 flex items-center space-x-2">
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </h3>
              <p className="text-xs text-rose-200/70">
                Permanently deletes your Firebase Auth account and profile document. Warns explicitly that shared couple data is preserved if a partner remains paired.
              </p>
            </div>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-xs font-bold text-rose-400 flex items-center space-x-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account</span>
            </button>
          </div>

          {/* Delete Account Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-[#12040A]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="moi-card p-6 max-w-md w-full bg-gradient-to-br from-[#2F0B1E] to-[#1C0512] border border-rose-500/40 space-y-4 text-center shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Permanently Delete Account?</h4>
                  <p className="text-xs text-rose-200/70">
                    This will unpair your account and delete your login profile. Your partner's data remains safe.
                  </p>
                </div>

                {user.providerData[0]?.providerId === "password" && (
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter password to confirm"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1B0710] border border-rose-500/40 text-center font-bold text-xs text-white focus:outline-none"
                    style={{ color: "#FFFFFF", backgroundColor: "#1B0710" }}
                  />
                )}

                {deleteError && <p className="text-xs font-bold text-rose-400">{deleteError}</p>}

                <div className="flex justify-end space-x-3 pt-2">
                  <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-xs font-bold text-rose-300/70 hover:text-white">Cancel</button>
                  <button
                    onClick={handleConfirmDeleteAccount}
                    disabled={isDeletingAccount}
                    className="moi-button-primary px-5 py-2 text-xs font-extrabold"
                  >
                    {isDeletingAccount ? "Deleting Account..." : "Confirm Account Deletion"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- 6. DATA EXPORT SECTION --- */}
      {activeTab === "export" && (
        <div className="moi-card p-8 bg-wine-950/90 border border-rose-500/30 space-y-6 shadow-2xl">
          <div className="flex items-center space-x-3 border-b border-rose-900/40 pb-4">
            <Download className="w-6 h-6 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Data Privacy & Export</h2>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-rose-200/80 leading-relaxed">
              You own your data. Click below to download a structured JSON archive containing your profile metadata, answered cards history, mood trends, and memories.
            </p>

            <button
              onClick={handleDownloadData}
              disabled={isExporting}
              className="moi-button-primary px-6 py-3 text-xs font-extrabold inline-flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? "Preparing JSON Archive..." : "Download My Data (JSON)"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
