/**
 * Web Audio API Tone Synthesizer for Moi Call Audio & Ringtones
 * Zero external audio assets required.
 */

class ToneManager {
  private ctx: AudioContext | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeGainNodes: GainNode[] = [];
  private ringtoneInterval: NodeJS.Timeout | null = null;
  private dialToneInterval: NodeJS.Timeout | null = null;
  private isRingtonePlaying = false;
  private isDialTonePlaying = false;

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((err) => console.warn("AudioContext resume failed:", err));
    }
    return this.ctx;
  }

  /**
   * Returns true if AudioContext is suspended and needs a user gesture to resume.
   */
  public isAutoplayBlocked(): boolean {
    if (typeof window === "undefined") return false;
    return !!this.ctx && this.ctx.state === "suspended";
  }

  /**
   * Resumes AudioContext on user gesture (click/tap/keypress).
   */
  public unlockAudioContext(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === "suspended") {
        return ctx.resume();
      }
    } catch (e) {
      console.warn("Error unlocking AudioContext:", e);
    }
    return Promise.resolve();
  }

  /**
   * Starts synthesized incoming call ringtone:
   * Alternating 440Hz / 480Hz dual-tone pulse (200ms ON / 200ms OFF cadence).
   */
  public startRingtone(): void {
    if (this.isRingtonePlaying) return;
    this.stopAllTones();
    this.isRingtonePlaying = true;

    const playPulse = () => {
      if (!this.isRingtonePlaying) return;
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(440, now); // Standard US/UK ring frequency A4

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(480, now); // Standard ring frequency

        // Envelope: smooth fade-in and fade-out over 0.2s to prevent harsh clicking
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
        gain.gain.setValueAtTime(0.15, now + 0.18);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);

        this.activeOscillators.push(osc1, osc2);
        this.activeGainNodes.push(gain);
      } catch (err) {
        console.error("Error playing ringtone pulse:", err);
      }
    };

    // Play initial pulse immediately, then loop every 400ms (200ms ON / 200ms OFF)
    playPulse();
    this.ringtoneInterval = setInterval(playPulse, 400);
  }

  /**
   * Starts synthesized outgoing dial tone:
   * Classic 350Hz + 440Hz dual-tone cadence (2.0s ON / 4.0s OFF repeat pattern).
   */
  public startDialTone(): void {
    if (this.isDialTonePlaying) return;
    this.stopAllTones();
    this.isDialTonePlaying = true;

    const playBurst = () => {
      if (!this.isDialTonePlaying) return;
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(350, now); // F4 tone

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(440, now); // A4 tone

        // Envelope: 2 seconds burst with smooth edges
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.95);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);

        this.activeOscillators.push(osc1, osc2);
        this.activeGainNodes.push(gain);
      } catch (err) {
        console.error("Error playing dial tone burst:", err);
      }
    };

    // Play initial burst immediately, then repeat every 6 seconds (2s ON / 4s OFF)
    playBurst();
    this.dialToneInterval = setInterval(playBurst, 6000);
  }

  /**
   * Immediately stops all active oscillators, timers, and active gains.
   */
  public stopAllTones(): void {
    this.isRingtonePlaying = false;
    this.isDialTonePlaying = false;

    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }

    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    this.activeOscillators = [];

    this.activeGainNodes.forEach((gain) => {
      try {
        gain.disconnect();
      } catch (e) {}
    });
    this.activeGainNodes = [];
  }
}

export const toneManager = new ToneManager();
