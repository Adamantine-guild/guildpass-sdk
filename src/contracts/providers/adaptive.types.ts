// GuildPass SDK: Import external module dependencies.
import { HttpHooks } from '../../http/http.types';

/**
 * The read strategies the adaptive provider can route through, ordered from
 * most to least efficient. The provider degrades along this hierarchy:
 * Multicall3 -> JSON-RPC batch -> sequential individual calls.
 */
export enum ReadStrategy {
  MULTICALL3 = 'MULTICALL3',
  JSON_RPC_BATCH = 'JSON_RPC_BATCH',
  SEQUENTIAL = 'SEQUENTIAL',
}

/**
 * The static, capability-level facts probed once per RPC URL and cached.
 * These answer "what is this endpoint able to do?" independent of its
 * current health.
 */
export type UrlCapabilities = {
  /** Whether the endpoint honours JSON-RPC 2.0 array (batch) requests. */
  supportsJsonRpcBatch: boolean;
  /** Whether Multicall3 is deployed and responsive at the well-known address. */
  multicall3Available: boolean;
};

/**
 * The rolling health signal for a single RPC URL, updated after every call.
 * A circuit breaker opens when consecutive failures cross a threshold, at
 * which point the URL is skipped until a cooldown elapses.
 */
export type UrlHealth = {
  /** Consecutive transient failures since the last success. */
  consecutiveFailures: number;
  /** Exponential moving average of observed latency, in milliseconds. */
  latencyEmaMs: number;
  /** Circuit state: closed = usable, open = skipped until `openUntil`. */
  circuitOpen: boolean;
  /** Epoch millis until which the circuit stays open. Zero when closed. */
  openUntil: number;
};

/**
 * Tunable thresholds for the health scorer and circuit breaker. All fields
 * are optional; sensible defaults are applied by the provider.
 */
export type AdaptiveHealthConfig = {
  /** Consecutive failures that trip the breaker open. Default: 3. */
  failureThreshold?: number;
  /** How long the circuit stays open before a trial call, ms. Default: 30000. */
  cooldownMs?: number;
  /** Smoothing factor for the latency EMA, between 0 and 1. Default: 0.3. */
  latencyEmaAlpha?: number;
  /** Batch size at or above which Multicall3 is strongly preferred. Default: 3. */
  multicallPreferenceThreshold?: number;
};

/** Well-known canonical Multicall3 deployment address (same on most chains). */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * The `aggregate3` selector on Multicall3:
 * aggregate3((address,bool,bytes)[]) -> (bool,bytes)[]
 */
export const MULTICALL3_AGGREGATE3_SELECTOR = '0x82ad56cb';

/** Options accepted by the adaptive provider at construction time. */
export type AdaptiveProviderOptions = {
  /** Optional observability hooks, forwarded to each underlying provider. */
  hooks?: HttpHooks;
  /** The chain ID for the current calls, forwarded to failover hooks. */
  chainId?: number;
  /** Health and circuit-breaker tuning. */
  health?: AdaptiveHealthConfig;
};
