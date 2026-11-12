/**
 * Per-key daily quota for paid AI calls (UTC day). In-memory: resets when the
 * process restarts. Adequate for a single-instance controlled pilot; replace
 * with a persistent store before scaling to multiple instances.
 */
export class DailyQuota {
  private day = "";
  private readonly used = new Map<string, number>();
  constructor(
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private rollover() {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used.clear();
    }
  }

  /** Reserves one unit. Returns false when the key is over its limit. */
  tryConsume(key: string): boolean {
    this.rollover();
    const n = this.used.get(key) ?? 0;
    if (n >= this.limit) return false;
    this.used.set(key, n + 1);
    return true;
  }

  /** Gives a unit back (e.g. when the provider call failed before producing output). */
  refund(key: string) {
    const n = this.used.get(key) ?? 0;
    if (n > 0) this.used.set(key, n - 1);
  }

  remaining(key: string): number {
    this.rollover();
    return Math.max(0, this.limit - (this.used.get(key) ?? 0));
  }
}
