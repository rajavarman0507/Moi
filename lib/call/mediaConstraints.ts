// Media constraints, codec preferences, track hints, and sender parameter management

export const IDEAL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

// Start low, ramp up: request getUserMedia video at 640x360 ideal, frameRate ideal 20 and max 24 (fallback to 320x240).
// Never start at 720p.
export const IDEAL_VIDEO_CONSTRAINTS_USER: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 20, max: 24 },
  facingMode: "user",
};

export const FALLBACK_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 20, max: 24 },
};

/**
 * Configure local media tracks for real-time speech and motion.
 */
export function applyTrackContentHints(stream: MediaStream): void {
  try {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack && "contentHint" in audioTrack) {
      audioTrack.contentHint = "speech";
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && "contentHint" in videoTrack) {
      videoTrack.contentHint = "motion";
    }
  } catch (e) {
    // Ignore contentHint error on older browsers
  }
}

/**
 * Configure audio sender with high priority and capped speech bitrate.
 * Audio has the highest priority and must never drop because of video.
 */
export async function configureAudioSender(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    // Cap voice bitrate between 24k and 32k for Opus speech
    params.encodings[0].maxBitrate = 32000;
    // Set priority and networkPriority to "high" where supported
    params.encodings[0].priority = "high";
    (params.encodings[0] as any).networkPriority = "high";
    await sender.setParameters(params);
  } catch (e) {
    console.debug("[Media] audio sender.setParameters notice:", e);
  }
}

/**
 * Set initial video sender maxBitrate to about 350 kbps, then increase only when stats show spare bandwidth.
 */
export async function configureVideoSender(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    // Start low at ~350 kbps, 24 fps max
    params.encodings[0].maxBitrate = 350000;
    params.encodings[0].maxFramerate = 24;
    params.encodings[0].scaleResolutionDownBy = 1.0;
    (params as any).degradationPreference = "maintain-framerate";
    await sender.setParameters(params);
  } catch (e) {
    console.debug("[Media] video sender.setParameters notice:", e);
  }
}

/**
 * Prefer VP8 for video unless unsupported, and only set codec preferences inside try/catch with a safe fallback.
 */
export function preferVp8VideoCodec(pc: RTCPeerConnection): void {
  try {
    const getCaps = (RTCRtpSender as any)?.getCapabilities || (RTCRtpReceiver as any)?.getCapabilities;
    if (typeof getCaps !== "function") return;

    const capabilities = getCaps("video");
    if (!capabilities || !capabilities.codecs || capabilities.codecs.length === 0) return;

    const codecs = capabilities.codecs;
    const vp8Codecs = codecs.filter((c: any) => c.mimeType?.toLowerCase() === "video/vp8");
    const otherCodecs = codecs.filter((c: any) => c.mimeType?.toLowerCase() !== "video/vp8");

    if (vp8Codecs.length === 0) return; // VP8 not in capabilities

    const preferredCodecs = [...vp8Codecs, ...otherCodecs];

    pc.getTransceivers().forEach((transceiver) => {
      try {
        const isVideoTransceiver =
          transceiver.sender.track?.kind === "video" ||
          transceiver.receiver.track?.kind === "video";

        if (isVideoTransceiver && typeof transceiver.setCodecPreferences === "function") {
          transceiver.setCodecPreferences(preferredCodecs);
        }
      } catch (e) {
        // Safe fallback
      }
    });
  } catch (err) {
    // Safe fallback if unsupported
  }
}

/**
 * Ensure Opus audio optimization in SDP:
 * mono, maxaveragebitrate 24000 to 32000 (28000), in-band FEC on, DTX on (usedtx=1), ptime 20.
 * Wraps everything in try/catch so a failure can never block call establishment.
 */
export function optimizeOpusSdp(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  try {
    const rtpmapMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
    const payloadType = rtpmapMatch ? rtpmapMatch[1] : "111";

    const opusParams = "useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=28000;ptime=20";
    const fmtpRegex = new RegExp(`a=fmtp:${payloadType} (.*)`, "g");

    if (!fmtpRegex.test(sdp)) {
      if (rtpmapMatch) {
        return sdp.replace(
          rtpmapMatch[0],
          `${rtpmapMatch[0]}\r\na=fmtp:${payloadType} ${opusParams}`
        );
      }
      return sdp;
    }

    return sdp.replace(new RegExp(`a=fmtp:${payloadType} (.*)`, "g"), (_match, p1) => {
      let line = p1;
      if (!line.includes("useinbandfec=1")) {
        line += ";useinbandfec=1";
      }
      if (!line.includes("usedtx=1")) {
        line += ";usedtx=1";
      }
      if (!line.includes("stereo=0")) {
        line += ";stereo=0";
      }
      if (!line.includes("ptime=")) {
        line += ";ptime=20";
      }
      if (line.includes("maxaveragebitrate=")) {
        line = line.replace(/maxaveragebitrate=\d+/, "maxaveragebitrate=28000");
      } else {
        line += ";maxaveragebitrate=28000";
      }
      return `a=fmtp:${payloadType} ${line}`;
    });
  } catch (err) {
    // If anything fails in regex manipulation, return completely unmodified SDP
    return sdp;
  }
}
