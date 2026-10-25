export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Spaces requests to the same host by at least `intervalMs` (or the host's robots.txt
 * Crawl-delay, capped). Slots are reserved synchronously, so concurrent callers queue
 * up instead of racing.
 */
export class HostRateLimiter {
  private readonly nextSlot = new Map<string, number>();
  private readonly hostInterval = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly maxCrawlDelayMs = 10_000,
    private readonly clock: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  setCrawlDelay(host: string, delayMs: number): void {
    const bounded = Math.min(this.maxCrawlDelayMs, Math.max(this.intervalMs, delayMs));
    this.hostInterval.set(host.toLowerCase(), bounded);
  }

  /** Resolves when the caller may send its request; returns how long it waited. */
  async acquire(host: string): Promise<number> {
    const key = host.toLowerCase();
    const interval = this.hostInterval.get(key) ?? this.intervalMs;
    const now = this.clock();
    const slot = Math.max(now, this.nextSlot.get(key) ?? 0);
    this.nextSlot.set(key, slot + interval);
    const delay = slot - now;
    if (delay > 0) await this.wait(delay);
    return delay;
  }
}

/** Counting semaphore for global concurrency limits. */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (limit < 1) throw new Error("Semaphore limit must be at least 1");
  }

  get inFlight(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => {
      this.active++;
      resolve();
    }));
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}
