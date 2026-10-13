// Screen Wake Lock helper for ongoing calls

class WakeLockController {
  private sentinel: any = null;
  private isActive: boolean = false;
  private onVisibilityChangeBound: () => void;

  constructor() {
    this.onVisibilityChangeBound = this.handleVisibilityChange.bind(this);
  }

  public async acquire(): Promise<void> {
    this.isActive = true;
    await this.requestLock();

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChangeBound);
      document.addEventListener("visibilitychange", this.onVisibilityChangeBound);
    }
  }

  public async release(): Promise<void> {
    this.isActive = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChangeBound);
    }

    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch (e) {
        // ignore
      }
      this.sentinel = null;
    }
  }

  private async requestLock(): Promise<void> {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    try {
      this.sentinel = await (navigator as any).wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
      });
    } catch (err) {
      // Wake lock requests can be rejected if low battery or tab hidden
      console.debug("[WakeLock] Note: could not acquire wake lock:", err);
    }
  }

  private async handleVisibilityChange(): Promise<void> {
    if (this.isActive && document.visibilityState === "visible") {
      await this.requestLock();
    }
  }
}

export const wakeLockController = new WakeLockController();
