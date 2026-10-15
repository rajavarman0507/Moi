// Adaptive quality ladder, stats monitor, and network resilience controller

export type CallQualityTier = "good" | "fair" | "poor";

export interface CallStatsSnapshot {
  timestamp: number;
  quality: CallQualityTier;
  level: number; // 3: 360p/24fps, 2: 360p/15fps, 1: 240p/12fps, 0: Audio only
  levelLabel: string;
  resolution: { width: number; height: number };
  fps: number;
  bitrateKbps: number;
  availableOutgoingBitrateKbps: number;
  packetLossPercent: number;
  packetsLostTotal: number;
  rttMs: number;
  jitterMs: number;
  candidateType: "host" | "srflx" | "prflx" | "relay" | "unknown";
  audioBytesReceived: number;
  videoBytesReceived: number;
  audioPacketsReceived: number;
  videoPacketsReceived: number;
  scaleResolutionDownBy: number;
  isVideoPausedForWeakConnection: boolean;
}

export class AdaptiveQualityController {
  private pc: RTCPeerConnection;
  private videoSender: RTCRtpSender | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private isUserCameraOff: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  // Callbacks
  private onStatsCallback?: (stats: CallStatsSnapshot) => void;
  private onMediaStalledCallback?: () => void;
  private onMediaRecoveredCallback?: () => void;

  // Tracking state for diff calculations
  private prevTimestamp: number = 0;
  private prevBytesSent: number = 0;
  private prevPacketsSent: number = 0;
  private prevPacketsLost: number = 0;

  // Inbound packet stall watcher (5 seconds without packets -> connection problem)
  private lastInboundPackets: number = 0;
  private stalledPacketsDurationMs: number = 0;
  private isMediaStalled: boolean = false;

  // Adaptive ladder state
  // Levels:
  // 3: 360p/24fps @ ~350k (ramp to 1M if spare bandwidth), maintain-framerate
  // 2: 360p/15fps @ ~250k, balanced
  // 1: 240p/12fps @ ~150k, balanced
  // 0: Audio only (video paused), balanced
  private currentLevel: number = 3;
  private spareBandwidthBitrate: number = 350000;
  private consecutiveGoodIntervals: number = 0; // Needs 15s (8 intervals @ 2s) to step up
  private consecutiveLevel0BadIntervals: number = 0; // Needs 6s (3 intervals @ 2s) to drop to audio-only
  private isVideoPausedForWeakConnection: boolean = false;

  constructor(
    pc: RTCPeerConnection,
    onStats?: (stats: CallStatsSnapshot) => void,
    onMediaStalled?: () => void,
    onMediaRecovered?: () => void
  ) {
    this.pc = pc;
    this.onStatsCallback = onStats;
    this.onMediaStalledCallback = onMediaStalled;
    this.onMediaRecoveredCallback = onMediaRecovered;
  }

  public setVideoSender(sender: RTCRtpSender | null) {
    this.videoSender = sender;
  }

  public setLocalVideoTrack(track: MediaStreamTrack | null, isUserCameraOff: boolean = false) {
    this.localVideoTrack = track;
    this.isUserCameraOff = isUserCameraOff;
  }

  public setUserCameraOff(isOff: boolean) {
    this.isUserCameraOff = isOff;
    if (this.localVideoTrack && !this.isVideoPausedForWeakConnection) {
      this.localVideoTrack.enabled = !isOff;
    }
  }

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.sampleStats(), 2000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stalledPacketsDurationMs = 0;
    this.isMediaStalled = false;
  }

  private async sampleStats() {
    if (!this.pc || this.pc.connectionState === "closed") return;

    try {
      const stats = await this.pc.getStats();

      let activeCandidatePair: any = null;
      let localCandidate: any = null;
      let outboundVideoRtp: any = null;
      let remoteInboundVideoRtp: any = null;
      let inboundAudioRtp: any = null;
      let inboundVideoRtp: any = null;

      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          activeCandidatePair = stats.get(report.selectedCandidatePairId);
        } else if (report.type === "candidate-pair" && (report.selected || report.nominated)) {
          if (!activeCandidatePair || report.state === "succeeded") {
            activeCandidatePair = report;
          }
        }

        if (report.type === "outbound-rtp" && report.kind === "video") {
          outboundVideoRtp = report;
        } else if (report.type === "remote-inbound-rtp" && report.kind === "video") {
          remoteInboundVideoRtp = report;
        } else if (report.type === "inbound-rtp") {
          if (report.kind === "audio") {
            inboundAudioRtp = report;
          } else if (report.kind === "video") {
            inboundVideoRtp = report;
          }
        }
      });

      if (activeCandidatePair && activeCandidatePair.localCandidateId) {
        localCandidate = stats.get(activeCandidatePair.localCandidateId);
      }

      // Candidate type (host / srflx / prflx / relay)
      let candidateType: CallStatsSnapshot["candidateType"] = "unknown";
      if (localCandidate) {
        candidateType = localCandidate.candidateType || "unknown";
      }

      // Available Outgoing Bitrate (bps -> kbps)
      let availableOutgoingBitrateBps = 0;
      if (activeCandidatePair && typeof activeCandidatePair.availableOutgoingBitrate === "number") {
        availableOutgoingBitrateBps = activeCandidatePair.availableOutgoingBitrate;
      }
      const availableOutgoingBitrateKbps = Math.round(availableOutgoingBitrateBps / 1000);

      // RTT (ms)
      let rttMs = 0;
      if (activeCandidatePair && typeof activeCandidatePair.currentRoundTripTime === "number") {
        rttMs = Math.round(activeCandidatePair.currentRoundTripTime * 1000);
      } else if (remoteInboundVideoRtp && typeof remoteInboundVideoRtp.roundTripTime === "number") {
        rttMs = Math.round(remoteInboundVideoRtp.roundTripTime * 1000);
      }

      // Jitter (ms)
      let jitterMs = 0;
      if (remoteInboundVideoRtp && typeof remoteInboundVideoRtp.jitter === "number") {
        jitterMs = Math.round(remoteInboundVideoRtp.jitter * 1000);
      } else if (inboundAudioRtp && typeof inboundAudioRtp.jitter === "number") {
        jitterMs = Math.round(inboundAudioRtp.jitter * 1000);
      }

      // Inbound counts
      const audioBytesReceived = inboundAudioRtp?.bytesReceived || 0;
      const videoBytesReceived = inboundVideoRtp?.bytesReceived || 0;
      const audioPacketsReceived = inboundAudioRtp?.packetsReceived || 0;
      const videoPacketsReceived = inboundVideoRtp?.packetsReceived || 0;
      const totalInboundPackets = audioPacketsReceived + videoPacketsReceived;

      // Packets lost total
      const packetsLostTotal =
        (remoteInboundVideoRtp?.packetsLost || 0) +
        (inboundAudioRtp?.packetsLost || 0) +
        (inboundVideoRtp?.packetsLost || 0);

      // 5-second stalled media detection when remote tracks exist
      const hasRemoteTracks = this.pc.getReceivers().some(
        (r) => r.track && r.track.readyState === "live"
      );
      if (hasRemoteTracks && totalInboundPackets > 0) {
        if (totalInboundPackets === this.lastInboundPackets) {
          this.stalledPacketsDurationMs += 2000;
          if (this.stalledPacketsDurationMs >= 5000 && !this.isMediaStalled) {
            this.isMediaStalled = true;
            try {
              this.onMediaStalledCallback?.();
            } catch (e) {}
          }
        } else {
          if (this.isMediaStalled) {
            this.isMediaStalled = false;
            try {
              this.onMediaRecoveredCallback?.();
            } catch (e) {}
          }
          this.stalledPacketsDurationMs = 0;
          this.lastInboundPackets = totalInboundPackets;
        }
      }

      // FPS and Resolution
      const width = outboundVideoRtp?.frameWidth || 0;
      const height = outboundVideoRtp?.frameHeight || 0;
      const fps = Math.round(outboundVideoRtp?.framesPerSecond || 0);

      // Sent Bitrate (kbps)
      const now = Date.now();
      let bitrateKbps = 0;
      if (outboundVideoRtp && this.prevTimestamp > 0) {
        const bytesDiff = (outboundVideoRtp.bytesSent || 0) - this.prevBytesSent;
        const timeDiffSec = (now - this.prevTimestamp) / 1000;
        if (timeDiffSec > 0 && bytesDiff >= 0) {
          bitrateKbps = Math.round((bytesDiff * 8) / (timeDiffSec * 1000));
        }
      }

      // Packet Loss (%)
      let packetLossPercent = 0;
      if (remoteInboundVideoRtp) {
        if (typeof remoteInboundVideoRtp.fractionLost === "number") {
          packetLossPercent = Math.round(remoteInboundVideoRtp.fractionLost * 100);
        } else if (outboundVideoRtp) {
          const packetsSentDiff = (outboundVideoRtp.packetsSent || 0) - this.prevPacketsSent;
          const packetsLostDiff = (remoteInboundVideoRtp.packetsLost || 0) - this.prevPacketsLost;
          if (packetsSentDiff > 0 && packetsLostDiff >= 0) {
            packetLossPercent = Math.min(100, Math.round((packetsLostDiff / (packetsSentDiff + packetsLostDiff)) * 100));
          }
        }
      }

      // Update previous diff references
      if (outboundVideoRtp) {
        this.prevBytesSent = outboundVideoRtp.bytesSent || 0;
        this.prevPacketsSent = outboundVideoRtp.packetsSent || 0;
      }
      if (remoteInboundVideoRtp) {
        this.prevPacketsLost = remoteInboundVideoRtp.packetsLost || 0;
      }
      this.prevTimestamp = now;

      // ==========================================
      // ADAPTIVE QUALITY LADDER DECISION ENGINE
      // ==========================================

      // Level 0 condition check: available bitrate stays below ~120 kbps OR packet loss stays above 12% for 6 seconds (3 samples)
      const isSevereWeakCondition =
        (availableOutgoingBitrateBps > 0 && availableOutgoingBitrateBps < 120000) ||
        packetLossPercent > 12;

      if (isSevereWeakCondition) {
        this.consecutiveLevel0BadIntervals++;
        if (this.consecutiveLevel0BadIntervals >= 3 && this.currentLevel > 0) {
          // Drop directly to Level 0: Video paused (audio only)
          this.currentLevel = 0;
          this.consecutiveLevel0BadIntervals = 0;
          this.consecutiveGoodIntervals = 0;
          await this.applyLevel(0);
        }
      } else {
        this.consecutiveLevel0BadIntervals = 0;
      }

      // Fast Step-Down check (if not already at Level 0 or just transitioned)
      if (this.currentLevel > 0) {
        if (this.currentLevel === 3) {
          const shouldDropToLevel2 =
            (availableOutgoingBitrateBps > 0 && availableOutgoingBitrateBps < 300000) ||
            packetLossPercent > 5 ||
            rttMs > 350 ||
            jitterMs > 40;

          if (shouldDropToLevel2) {
            this.currentLevel = 2;
            this.consecutiveGoodIntervals = 0;
            await this.applyLevel(2);
          }
        } else if (this.currentLevel === 2) {
          const shouldDropToLevel1 =
            (availableOutgoingBitrateBps > 0 && availableOutgoingBitrateBps < 200000) ||
            packetLossPercent > 8 ||
            rttMs > 450 ||
            jitterMs > 60;

          if (shouldDropToLevel1) {
            this.currentLevel = 1;
            this.consecutiveGoodIntervals = 0;
            await this.applyLevel(1);
          }
        }
      }

      // Slow Step-Up check: after 15 seconds of good stats (8 samples @ 2s = 16s)
      const isGoodCondition =
        packetLossPercent <= 3 &&
        rttMs <= 250 &&
        jitterMs <= 30 &&
        (availableOutgoingBitrateBps === 0 ||
          (this.currentLevel === 0 && availableOutgoingBitrateBps >= 180000) ||
          (this.currentLevel === 1 && availableOutgoingBitrateBps >= 300000) ||
          (this.currentLevel === 2 && availableOutgoingBitrateBps >= 450000));

      if (isGoodCondition && this.currentLevel < 3) {
        this.consecutiveGoodIntervals++;
        if (this.consecutiveGoodIntervals >= 8) {
          this.consecutiveGoodIntervals = 0;
          this.currentLevel++;
          await this.applyLevel(this.currentLevel);
        }
      } else if (!isGoodCondition) {
        this.consecutiveGoodIntervals = 0;
      }

      // If at Level 3: ramp up video bitrate up to 1 Mbps when spare bandwidth exists
      if (this.currentLevel === 3 && this.videoSender) {
        if (availableOutgoingBitrateBps > 800000 && packetLossPercent < 2 && rttMs < 150) {
          if (this.spareBandwidthBitrate < 1000000) {
            this.spareBandwidthBitrate = Math.min(1000000, this.spareBandwidthBitrate + 150000);
            await this.applySpareBandwidthBitrate(this.spareBandwidthBitrate);
          }
        } else if (availableOutgoingBitrateBps > 0 && availableOutgoingBitrateBps < 500000) {
          if (this.spareBandwidthBitrate > 350000) {
            this.spareBandwidthBitrate = 350000;
            await this.applySpareBandwidthBitrate(350000);
          }
        }
      }

      // Overall quality label
      let quality: CallQualityTier = "good";
      if (packetLossPercent > 10 || rttMs > 450 || this.currentLevel <= 1) {
        quality = "poor";
      } else if (packetLossPercent > 4 || rttMs > 250 || this.currentLevel === 2) {
        quality = "fair";
      }

      const levelLabels = [
        "Level 0: Audio only (Weak network)",
        "Level 1: 240p/12fps (~150k)",
        "Level 2: 360p/15fps (~250k)",
        `Level 3: 360p/24fps (~${Math.round(this.spareBandwidthBitrate / 1000)}k)`,
      ];

      const snapshot: CallStatsSnapshot = {
        timestamp: now,
        quality,
        level: this.currentLevel,
        levelLabel: levelLabels[this.currentLevel] || `Level ${this.currentLevel}`,
        resolution: { width, height },
        fps,
        bitrateKbps,
        availableOutgoingBitrateKbps,
        packetLossPercent,
        packetsLostTotal,
        rttMs,
        jitterMs,
        candidateType,
        audioBytesReceived,
        videoBytesReceived,
        audioPacketsReceived,
        videoPacketsReceived,
        scaleResolutionDownBy: this.currentLevel === 1 ? 1.5 : 1.0,
        isVideoPausedForWeakConnection: this.isVideoPausedForWeakConnection,
      };

      if (this.onStatsCallback) {
        this.onStatsCallback(snapshot);
      }
    } catch (e) {
      console.debug("[Stats] getStats sampling error:", e);
    }
  }

  private async applySpareBandwidthBitrate(bitrateBps: number) {
    if (!this.videoSender) return;
    try {
      const params = this.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = bitrateBps;
      await this.videoSender.setParameters(params);
    } catch (e) {
      // Safe ignore
    }
  }

  private async applyLevel(level: number) {
    if (!this.videoSender) return;

    try {
      const params = this.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (level === 3) {
        // Level 3: 360p / 24fps @ initial ~350k (ramp to 1M), maintain-framerate
        this.isVideoPausedForWeakConnection = false;
        params.encodings[0].active = true;
        params.encodings[0].maxBitrate = this.spareBandwidthBitrate;
        params.encodings[0].maxFramerate = 24;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        (params as any).degradationPreference = "maintain-framerate";

        if (this.localVideoTrack && !this.isUserCameraOff) {
          this.localVideoTrack.enabled = true;
        }
      } else if (level === 2) {
        // Level 2: 360p / 15fps @ ~250k, balanced
        this.isVideoPausedForWeakConnection = false;
        params.encodings[0].active = true;
        params.encodings[0].maxBitrate = 250000;
        params.encodings[0].maxFramerate = 15;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        (params as any).degradationPreference = "balanced";

        if (this.localVideoTrack && !this.isUserCameraOff) {
          this.localVideoTrack.enabled = true;
        }
      } else if (level === 1) {
        // Level 1: 240p / 12fps @ ~150k, balanced (scaleResolutionDownBy 1.5)
        this.isVideoPausedForWeakConnection = false;
        params.encodings[0].active = true;
        params.encodings[0].maxBitrate = 150000;
        params.encodings[0].maxFramerate = 12;
        params.encodings[0].scaleResolutionDownBy = 1.5;
        (params as any).degradationPreference = "balanced";

        if (this.localVideoTrack && !this.isUserCameraOff) {
          this.localVideoTrack.enabled = true;
        }
      } else if (level === 0) {
        // Level 0: Video paused (audio only) when below ~120k or packet loss > 12% for 6s
        this.isVideoPausedForWeakConnection = true;
        params.encodings[0].active = false;
        (params as any).degradationPreference = "balanced";

        if (this.localVideoTrack) {
          this.localVideoTrack.enabled = false;
        }
      }

      await this.videoSender.setParameters(params);
    } catch (err) {
      console.warn("[AdaptiveQuality] Error applying quality level:", err);
    }
  }
}
