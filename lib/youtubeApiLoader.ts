"use client";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

/**
 * Singleton loader for YouTube IFrame Player API.
 * Guarantees script is injected once and window.onYouTubeIframeAPIReady callback
 * is shared safely across all consumers (/music, /call, and /settings) without race conditions.
 */
export function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API can only be loaded in browser environment"));
  }

  // 1. If already loaded and YT.Player is constructor, resolve immediately
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  // 2. Return existing in-flight loading promise if already requested
  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise((resolve, reject) => {
    // Preserve existing callback if another consumer attached one earlier
    const existingCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      if (typeof existingCallback === "function") {
        try {
          existingCallback();
        } catch (e) {
          console.warn("Error in existing onYouTubeIframeAPIReady callback:", e);
        }
      }
      resolve(window.YT);
    };

    // Inject iframe API script tag if missing
    if (!document.getElementById("yt-iframe-api-script")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = (err) => {
        apiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API script"));
      };

      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  });

  return apiPromise;
}
