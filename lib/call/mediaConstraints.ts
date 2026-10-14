// Media constraints, codec preferences, track hints, and sender parameter management

export const IDEAL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export const IDEAL_VIDEO_CONSTRAINTS_USER: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user",
};

export const FALLBACK_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30, max: 30 },
};

/**
 * Configure local media tracks for real-time speech and motion.
 */
export function applyTrackContentHints(stream: MediaStream): void {
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack && "contentHint" in audioTrack) {
    audioTrack.contentHint = "speech";
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && "contentHint" in videoTrack) {
    videoTrack.contentHint = "motion";
  }
}

/**
 * Apply sender bitrate limits, framerates, and degradation preferences via RTCRtpSender.setParameters.
 */
export async function configureAudioSender(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    // Cap voice bitrate at ~48 kbps for high-efficiency Opus speech
    params.encodings[0].maxBitrate = 48000;
    params.encodings[0].priority = "high";
    params.encodings[0].networkPriority = "high";
    await sender.setParameters(params);
  } catch (e) {
    // Some browsers have restrictions or don't support all parameter fields
    console.debug("[Media] audio sender.setParameters notice:", e);
  }
}

export async function configureVideoSender(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 1500000; // 1.5 Mbps
    params.encodings[0].maxFramerate = 30;
    (params as any).degradationPreference = "maintain-framerate";
    await sender.setParameters(params);
  } catch (e) {
    console.debug("[Media] video sender.setParameters notice:", e);
  }
}

/**
 * Ensure in-band FEC and cap maxaveragebitrate in Opus SDP line.
 * Dynamically resolves Opus payload type from the "a=rtpmap:<n> opus/48000/2" line,
 * and wraps everything in try/catch so a failure can never block call establishment.
 */
export function optimizeOpusSdp(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  try {
    const rtpmapMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
    const payloadType = rtpmapMatch ? rtpmapMatch[1] : "111";

    const fmtpRegex = new RegExp(`a=fmtp:${payloadType} (.*)`, "g");
    if (!fmtpRegex.test(sdp)) {
      if (rtpmapMatch) {
        return sdp.replace(
          rtpmapMatch[0],
          `${rtpmapMatch[0]}\r\na=fmtp:${payloadType} useinbandfec=1;stereo=0;maxaveragebitrate=48000`
        );
      }
      return sdp;
    }

    return sdp.replace(new RegExp(`a=fmtp:${payloadType} (.*)`, "g"), (_match, p1) => {
      let line = p1;
      if (!line.includes("useinbandfec=1")) {
        line += ";useinbandfec=1";
      }
      if (!line.includes("stereo=0")) {
        line += ";stereo=0";
      }
      if (line.includes("maxaveragebitrate=")) {
        line = line.replace(/maxaveragebitrate=\d+/, "maxaveragebitrate=48000");
      } else {
        line += ";maxaveragebitrate=48000";
      }
      return `a=fmtp:${payloadType} ${line}`;
    });
  } catch (err) {
    // If anything fails in regex manipulation, return completely unmodified SDP
    return sdp;
  }
}
