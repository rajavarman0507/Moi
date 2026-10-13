// Adaptive quality controller and stats monitor

export type CallQualityTier = "good" | "fair" | "poor";

export interface CallStatsSnapshot {
  timestamp: number;
  quality: CallQualityTier;
  resolution: { width: number; height: number };
  fps: number;
  bitrateKbps: number;
  packetLossPercent: number;
  rttMs: number;
  candidateType: "host" | "srflx" | "prflx" | "relay" | "unknown";
  scaleResolutionDownBy: number;
}

export class AdaptiveQualityController {
  private pc: RTCPeerConnection;
  private videoSender: RTCRtpSender | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private onStatsCallback?: (stats: CallStatsSnapshot) => void;

  // Tracking state
  private prevTimestamp: number = 0;
  private prevBytesSent: number = 0;
  private prevPacketsSent: number = 0;
  private prevPacketsLost: number = 0;

  // Step-down & recovery state
  private currentDegradationLevel: number = 0; // 0: 1.5Mbps, 1: 600kbps (scale 1.5), 2: 300kbps (scale 2.0)
  private badIntervalsCount: number = 0;
  private goodIntervalsCount: number = 0;

  constructor(pc: RTCPeerConnection, onStats?: (stats: CallStatsSnapshot) => void) {
    this.pc = pc;
    this.onStatsCallback = onStats;
  }

  public setVideoSender(sender: RTCRtpSender | null) {
    this.videoSender = sender;
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
  }

  private async sampleStats() {
    if (!this.pc || this.pc.connectionState === "closed") return;

    try {
      const stats = await this.pc.getStats();

      let activeCandidatePair: any = null;
      let localCandidate: any = null;
      let outboundVideoRtp: any = null;
      let remoteInboundVideoRtp: any = null;

      // Avoid for...of with Map/Set iterator downlevel compilation issues
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
        }
      });

      if (activeCandidatePair && activeCandidatePair.localCandidateId) {
        localCandidate = stats.get(activeCandidatePair.localCandidateId);
      }

      // Calculate candidate type
      let candidateType: CallStatsSnapshot["candidateType"] = "unknown";
      if (localCandidate) {
        candidateType = localCandidate.candidateType || "unknown";
      }

      // Calculate RTT
      let rttMs = 0;
      if (activeCandidatePair && typeof activeCandidatePair.currentRoundTripTime === "number") {
        rttMs = Math.round(activeCandidatePair.currentRoundTripTime * 1000);
      } else if (remoteInboundVideoRtp && typeof remoteInboundVideoRtp.roundTripTime === "number") {
        rttMs = Math.round(remoteInboundVideoRtp.roundTripTime * 1000);
      }

      // Calculate FPS and Resolution
      const width = outboundVideoRtp?.frameWidth || 0;
      const height = outboundVideoRtp?.frameHeight || 0;
      const fps = outboundVideoRtp?.framesPerSecond || 0;

      // Calculate Bitrate (kbps)
      const now = Date.now();
      let bitrateKbps = 0;
      if (outboundVideoRtp && this.prevTimestamp > 0) {
        const bytesDiff = (outboundVideoRtp.bytesSent || 0) - this.prevBytesSent;
        const timeDiffSec = (now - this.prevTimestamp) / 1000;
        if (timeDiffSec > 0 && bytesDiff >= 0) {
          bitrateKbps = Math.round((bytesDiff * 8) / (timeDiffSec * 1000));
        }
      }

      // Calculate Packet Loss (%)
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

      // Update previous tracking values
      if (outboundVideoRtp) {
        this.prevBytesSent = outboundVideoRtp.bytesSent || 0;
        this.prevPacketsSent = outboundVideoRtp.packetsSent || 0;
      }
      if (remoteInboundVideoRtp) {
        this.prevPacketsLost = remoteInboundVideoRtp.packetsLost || 0;
      }
      this.prevTimestamp = now;

      // Evaluate Quality tier & trigger adaptive step-down / step-up
      const isBadCondition = packetLossPercent > 8 || rttMs > 400;

      if (isBadCondition) {
        this.badIntervalsCount++;
        this.goodIntervalsCount = 0;

        // If bad for 3 consecutive samples (6 seconds) -> step down
        if (this.badIntervalsCount >= 3) {
          this.stepDown();
          this.badIntervalsCount = 0;
        }
      } else {
        this.goodIntervalsCount++;
        this.badIntervalsCount = 0;

        // If good for 5 consecutive samples (10 seconds) -> step back up
        if (this.goodIntervalsCount >= 5) {
          this.stepUp();
          this.goodIntervalsCount = 0;
        }
      }

      // Determine quality label
      let quality: CallQualityTier = "good";
      if (packetLossPercent > 12 || rttMs > 500 || this.currentDegradationLevel === 2) {
        quality = "poor";
      } else if (packetLossPercent > 5 || rttMs > 300 || this.currentDegradationLevel === 1) {
        quality = "fair";
      }

      const snapshot: CallStatsSnapshot = {
        timestamp: now,
        quality,
        resolution: { width, height },
        fps: Math.round(fps),
        bitrateKbps,
        packetLossPercent,
        rttMs,
        candidateType,
        scaleResolutionDownBy: this.currentDegradationLevel === 2 ? 2.0 : this.currentDegradationLevel === 1 ? 1.5 : 1.0,
      };

      if (this.onStatsCallback) {
        this.onStatsCallback(snapshot);
      }
    } catch (e) {
      console.debug("[Stats] getStats sampling note:", e);
    }
  }

  private async stepDown() {
    if (this.currentDegradationLevel >= 2 || !this.videoSender) return;

    this.currentDegradationLevel++;
    await this.applyDegradation();
  }

  private async stepUp() {
    if (this.currentDegradationLevel <= 0 || !this.videoSender) return;

    this.currentDegradationLevel--;
    await this.applyDegradation();
  }

  private async applyDegradation() {
    if (!this.videoSender) return;

    try {
      const params = this.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (this.currentDegradationLevel === 0) {
        // Full Quality: 1.5 Mbps, no scaling
        params.encodings[0].maxBitrate = 1500000;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        console.log("[AdaptiveQuality] Stepped up to full quality (1.5 Mbps)");
      } else if (this.currentDegradationLevel === 1) {
        // Step Down 1: 600 kbps, scale 1.5
        params.encodings[0].maxBitrate = 600000;
        params.encodings[0].scaleResolutionDownBy = 1.5;
        console.log("[AdaptiveQuality] Stepped down to Level 1 (600 kbps, scale 1.5)");
      } else if (this.currentDegradationLevel === 2) {
        // Step Down 2: 300 kbps, scale 2.0
        params.encodings[0].maxBitrate = 300000;
        params.encodings[0].scaleResolutionDownBy = 2.0;
        console.log("[AdaptiveQuality] Stepped down to Level 2 (300 kbps, scale 2.0)");
      }

      await this.videoSender.setParameters(params);
    } catch (err) {
      console.warn("[AdaptiveQuality] Error updating sender parameters:", err);
    }
  }
}
