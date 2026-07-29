// GuildPass SDK: Pull in package or module bindings.
import { AdaptiveHealthConfig, UrlHealth } from './adaptive.types';

const DEFAULTS: Omit<Required<AdaptiveHealthConfig>, 'onCircuitOpen' | 'onCircuitClosed'> & {
  onCircuitOpen?: (url: string, openUntil: number) => void;
  onCircuitClosed?: (url: string) => void;
} = {
  failureThreshold: 3,
  cooldownMs: 30000,
  latencyEmaAlpha: 0.3,
  multicallPreferenceThreshold: 3,
};

/**
 * Tracks rolling health per RPC URL and implements a per-URL circuit breaker.
 *
 * The breaker is a classic three-state machine collapsed into two flags:
 * - Closed: calls flow normally; failures accumulate.
 * - Open: once `failureThreshold` consecutive failures are seen, the circuit
 *   opens for `cooldownMs`. While open, the URL is reported unhealthy so the
 *   router skips it.
 * - Half-open (implicit): after the cooldown elapses, `isHealthy` reports the
 *   URL usable again for a single trial. A success closes the circuit; a
 *   failure re-opens it for another cooldown window.
 *
 * Latency is smoothed with an exponential moving average so a single slow
 * response does not dominate routing decisions.
 */
export class HealthTracker {
  private readonly config: Omit<Required<AdaptiveHealthConfig>, 'onCircuitOpen' | 'onCircuitClosed'> & {
    onCircuitOpen?: (url: string, openUntil: number) => void;
    onCircuitClosed?: (url: string) => void;
  };
  private readonly health = new Map<string, UrlHealth>();

  constructor(config?: AdaptiveHealthConfig) {
    this.config = { ...DEFAULTS, ...config };
  }

  /** Returns the (lazily created) health record for a URL. */
  private get(url: string): UrlHealth {
    let record = this.health.get(url);
    if (!record) {
      record = {
        consecutiveFailures: 0,
        latencyEmaMs: 0,
        circuitOpen: false,
        openUntil: 0,
      };
      this.health.set(url, record);
    }
    return record;
  }

  /**
   * Reports a usable URL: the circuit is closed unless it is open and still
   * inside its cooldown window. Once the cooldown passes, the URL becomes
   * usable again (half-open trial) even before an explicit success.
   */
  public isHealthy(url: string, now: number = Date.now()): boolean {
    const record = this.get(url);
    if (record.circuitOpen && now >= record.openUntil) {
      // Cooldown elapsed: allow a half-open trial call through.
      record.circuitOpen = false;
      if (this.config.onCircuitClosed) {
        this.config.onCircuitClosed(url);
      }
    }
    return !record.circuitOpen;
  }

  /** Records a successful call: resets failures and updates latency EMA. */
  public recordSuccess(url: string, latencyMs: number): void {
    const record = this.get(url);
    const wasOpen = record.circuitOpen;
    record.consecutiveFailures = 0;
    record.circuitOpen = false;
    record.openUntil = 0;
    record.latencyEmaMs =
      record.latencyEmaMs === 0
        ? latencyMs
        : this.config.latencyEmaAlpha * latencyMs +
          (1 - this.config.latencyEmaAlpha) * record.latencyEmaMs;

    if (wasOpen && this.config.onCircuitClosed) {
      this.config.onCircuitClosed(url);
    }
  }

  /**
   * Records a transient failure. When consecutive failures reach the
   * threshold the circuit trips open for the configured cooldown.
   */
  public recordFailure(url: string, now: number = Date.now()): void {
    const record = this.get(url);
    record.consecutiveFailures += 1;
    if (!record.circuitOpen && record.consecutiveFailures >= this.config.failureThreshold) {
      record.circuitOpen = true;
      record.openUntil = now + this.config.cooldownMs;
      if (this.config.onCircuitOpen) {
        this.config.onCircuitOpen(url, record.openUntil);
      }
    }
  }

  /**
   * Records a timeout failure. Delegates to recordFailure for circuit-breaker
   * logic and additionally increments a timeout-specific counter so the
   * adaptive provider can factor timeout frequency into health scoring.
   */
  public recordTimeout(url: string, now: number = Date.now()): void {
    const record = this.get(url);
    record.timeoutCount = (record.timeoutCount ?? 0) + 1;
    this.recordFailure(url, now);
  }

  /**
   * Returns the number of timeout failures recorded for a URL.
   */
  public timeoutCount(url: string): number {
    const record = this.health.get(url);
    return record?.timeoutCount ?? 0;
  }

  /** Current smoothed latency for a URL, or Infinity if never measured. */
  public latencyOf(url: string): number {
    const record = this.health.get(url);
    return record && record.latencyEmaMs > 0 ? record.latencyEmaMs : Infinity;
  }

  /** Batch size at or above which Multicall3 is strongly preferred. */
  public get multicallPreferenceThreshold(): number {
    return this.config.multicallPreferenceThreshold;
  }

  /** Test/observability hook: read-only snapshot of a URL's health. */
  public snapshot(url: string): Readonly<UrlHealth> | undefined {
    const record = this.health.get(url);
    return record ? { ...record } : undefined;
  }

  public snapshotAll(): Record<string, Readonly<UrlHealth>> {
    const result: Record<string, Readonly<UrlHealth>> = {};
    for (const [url, record] of this.health.entries()) {
      result[url] = { ...record };
    }
    return result;
  }
}
