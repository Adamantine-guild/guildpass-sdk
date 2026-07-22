// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../../errors/GuildPassError';
import { GuildPassErrorCode } from '../../errors/errorCodes';
import { HttpClient } from '../../http/httpClient';
import { RequestOptions } from '../../types/common';
import { BatchItemResult } from '../contract.types';
import { ContractProvider, EthCallRequest } from './provider.types';
import { JsonRpcContractProvider } from './jsonRpcProvider';
import { HealthTracker } from './healthTracker';
import {
  AdaptiveProviderOptions,
  MULTICALL3_ADDRESS,
  MULTICALL3_AGGREGATE3_SELECTOR,
  ReadStrategy,
  UrlCapabilities,
} from './adaptive.types';
import { encodeAggregate3, decodeAggregate3 } from './multicall3Provider';

/**
 * Returns `true` when an error is transient (worth trying another URL) rather
 * than a deterministic contract-level failure. Mirrors the semantics used by
 * {@link JsonRpcContractProvider}: contract reverts arrive as HTTP_ERROR with
 * a numeric JSON-RPC `code`; everything network-shaped is transient.
 */
function isTransient(err: unknown): boolean {
  if (err instanceof GuildPassError) {
    if (
      err.code === GuildPassErrorCode.REQUEST_CANCELLED ||
      err.code === GuildPassErrorCode.ABORTED
    ) {
      return false;
    }
    if (err.code === GuildPassErrorCode.HTTP_ERROR) {
      if (
        err.details &&
        typeof err.details === 'object' &&
        'code' in err.details &&
        typeof (err.details as { code: unknown }).code === 'number'
      ) {
        return false;
      }
      return err.status === undefined;
    }
    return (
      err.code === GuildPassErrorCode.SERVER_ERROR ||
      err.code === GuildPassErrorCode.RATE_LIMITED ||
      err.code === GuildPassErrorCode.TIMEOUT
    );
  }
  return err instanceof TypeError;
}

/**
 * A {@link ContractProvider} that transparently picks the best available read
 * strategy per RPC URL and per request, degrading gracefully through the
 * hierarchy Multicall3 -> JSON-RPC batch -> sequential individual calls.
 *
 * Design:
 * - Capability probing runs lazily, once per URL, and is cached. It answers
 *   two questions: does the endpoint honour JSON-RPC batches, and is
 *   Multicall3 deployed and responsive at the canonical address.
 * - A {@link HealthTracker} maintains a rolling circuit-breaker and latency
 *   signal per URL, so a capable-but-degraded endpoint is skipped in favour
 *   of a healthy one.
 * - Routing combines static capability with live health: the provider picks
 *   the first healthy URL, then the richest strategy that URL supports for
 *   the given batch size, and falls back one rung at a time on transient
 *   failure — first down the strategy hierarchy on the same URL, then across
 *   to the next healthy URL.
 *
 * The provider implements the same `ethCall` / `batchEthCall` surface as every
 * other provider, so it is a drop-in replacement wherever a `ContractProvider`
 * is accepted.
 */
export class AdaptiveContractProvider implements ContractProvider {
  private readonly http: HttpClient;
  private readonly urls: readonly string[];
  private readonly options: AdaptiveProviderOptions;
  private readonly health: HealthTracker;

  /** One underlying single-URL JSON-RPC provider per configured endpoint. */
  private readonly providers = new Map<string, JsonRpcContractProvider>();
  /** Cached capability probe result per URL (undefined = not yet probed). */
  private readonly capabilities = new Map<string, UrlCapabilities>();
  /** In-flight probe promises, so concurrent callers share one probe. */
  private readonly probing = new Map<string, Promise<UrlCapabilities>>();

  constructor(http: HttpClient, rpcUrls: string | string[], options: AdaptiveProviderOptions = {}) {
    this.http = http;
    this.urls = Array.isArray(rpcUrls) ? rpcUrls : [rpcUrls];
    this.options = options;
    this.health = new HealthTracker(options.health);

    if (this.urls.length === 0) {
      throw new GuildPassError(
        'AdaptiveContractProvider requires at least one RPC URL',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
  }

  /** Read-only view of the health tracker, for tests and observability. */
  public get healthTracker(): HealthTracker {
    return this.health;
  }

  /** Lazily constructs (and caches) the single-URL provider for a URL. */
  private providerFor(url: string): JsonRpcContractProvider {
    let provider = this.providers.get(url);
    if (!provider) {
      provider = new JsonRpcContractProvider(
        this.http,
        url,
        this.options.hooks,
        this.options.chainId,
      );
      this.providers.set(url, provider);
    }
    return provider;
  }

  /**
   * Probes a URL's capabilities exactly once, caching the result. Concurrent
   * callers awaiting the same URL share the single in-flight probe. A probe
   * never throws: on any failure it returns the most conservative capability
   * set (sequential only), so a probe hiccup can never break real calls.
   */
  private async probeCapabilities(url: string, options?: RequestOptions): Promise<UrlCapabilities> {
    const cached = this.capabilities.get(url);
    if (cached) return cached;

    const inFlight = this.probing.get(url);
    if (inFlight) return inFlight;

    const probe = this.runProbe(url, options)
      .then((result) => {
        this.capabilities.set(url, result);
        this.probing.delete(url);
        return result;
      })
      .catch(() => {
        const conservative: UrlCapabilities = {
          supportsJsonRpcBatch: false,
          multicall3Available: false,
        };
        this.capabilities.set(url, conservative);
        this.probing.delete(url);
        return conservative;
      });

    this.probing.set(url, probe);
    return probe;
  }

  /**
   * The actual probing work: fires a tiny JSON-RPC batch to detect batch
   * support, and a Multicall3 `aggregate3` of zero calls to detect whether
   * the contract is deployed and responsive at the canonical address. Both
   * checks are independent; a failure of one does not disable the other.
   */
  private async runProbe(url: string, options?: RequestOptions): Promise<UrlCapabilities> {
    const provider = this.providerFor(url);

    const supportsJsonRpcBatch = await this.detectBatchSupport(provider, options);
    const multicall3Available = await this.detectMulticall3(provider, options);

    return { supportsJsonRpcBatch, multicall3Available };
  }

  /**
   * Detects JSON-RPC batch support by sending a two-item batch. If the
   * endpoint returns ordered per-item results (rather than rejecting the
   * array outright) it honours batching.
   */
  private async detectBatchSupport(
    provider: JsonRpcContractProvider,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      const probeCall: EthCallRequest = { to: MULTICALL3_ADDRESS, data: '0x' };
      const results = await provider.batchEthCall([probeCall, probeCall], options);
      return Array.isArray(results) && results.length === 2;
    } catch {
      return false;
    }
  }

  /**
   * Detects Multicall3 by calling `aggregate3` with an empty tuple array. A
   * deployed Multicall3 accepts the call and returns a hex result; a chain
   * without it reverts or returns empty, which we treat as unavailable.
   */
  private async detectMulticall3(
    provider: JsonRpcContractProvider,
    options?: RequestOptions,
  ): Promise<boolean> {
    try {
      // aggregate3 with an empty dynamic array: selector + offset(0x20) + length(0x00).
      const data =
        MULTICALL3_AGGREGATE3_SELECTOR +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000000';
      const result = await provider.ethCall({ to: MULTICALL3_ADDRESS, data }, options);
      return typeof result === 'string' && result.length > 2;
    } catch {
      return false;
    }
  }

  /**
   * Chooses the richest strategy a URL can serve for a given batch size,
   * factoring in both static capability and the request shape. Single calls
   * never need Multicall3 or batching; multi-call requests prefer Multicall3
   * when the batch is large enough, then JSON-RPC batch, then sequential.
   */
  private selectStrategy(caps: UrlCapabilities, batchSize: number): ReadStrategy {
    if (batchSize <= 1) return ReadStrategy.SEQUENTIAL;
    if (
      caps.multicall3Available &&
      batchSize >= this.health.multicallPreferenceThreshold
    ) {
      return ReadStrategy.MULTICALL3;
    }
    if (caps.supportsJsonRpcBatch) return ReadStrategy.JSON_RPC_BATCH;
    // Batch too small to prefer Multicall3 above, and no JSON-RPC batch
    // support: use Multicall3 if it exists at all, otherwise go sequential.
    if (caps.multicall3Available) return ReadStrategy.MULTICALL3;
    return ReadStrategy.SEQUENTIAL;
  }

  /** Healthy URLs in priority order, falling back to all URLs if none pass. */
  private healthyUrls(now: number = Date.now()): string[] {
    const healthy = this.urls.filter((url) => this.health.isHealthy(url, now));
    return healthy.length > 0 ? healthy : [...this.urls];
  }

  // ---------------------------------------------------------------------------
  // ContractProvider surface
  // ---------------------------------------------------------------------------

  /**
   * Single read-only call. Walks healthy URLs in order; for each, times the
   * call to feed the latency EMA, records success/failure into the circuit
   * breaker, and moves to the next URL on a transient failure. Non-transient
   * (contract-level) failures are surfaced immediately.
   */
  public async ethCall(request: EthCallRequest, options?: RequestOptions): Promise<unknown> {
    let lastError: unknown;

    for (const url of this.healthyUrls()) {
      const provider = this.providerFor(url);
      const started = Date.now();
      try {
        const result = await provider.ethCall(request, options);
        this.health.recordSuccess(url, Date.now() - started);
        return result;
      } catch (err) {
        if (!isTransient(err)) throw err;
        this.health.recordFailure(url);
        lastError = err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new GuildPassError(
          'All RPC URLs failed for eth_call',
          GuildPassErrorCode.HTTP_ERROR,
        );
  }

  /**
   * Batch read-only call. For each healthy URL, probes capabilities (cached),
   * selects the best strategy for the batch size, and executes it. On a
   * transient failure the provider first degrades one strategy rung on the
   * same URL (Multicall3 -> JSON-RPC batch -> sequential), then advances to
   * the next healthy URL if the whole URL is failing.
   */
  public async batchEthCall(
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    if (requests.length === 0) return [];

    let lastError: unknown;

    // A single call can never benefit from Multicall3 or JSON-RPC batching, so
    // skip capability probing entirely and route straight to sequential. This
    // avoids two wasted probe round-trips on the first single-item request.
    const needsProbe = requests.length > 1;

    for (const url of this.healthyUrls()) {
      const caps = needsProbe
        ? await this.probeCapabilities(url, options)
        : { supportsJsonRpcBatch: false, multicall3Available: false };
      let strategy = this.selectStrategy(caps, requests.length);

      // Degrade through the strategy hierarchy on this URL before switching URLs.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const started = Date.now();
        try {
          const results = await this.execute(url, strategy, requests, options);
          this.health.recordSuccess(url, Date.now() - started);
          return results;
        } catch (err) {
          if (!isTransient(err)) throw err;
          lastError = err;
          const next = this.degrade(strategy);
          if (next === strategy) {
            // Already at the lowest rung: mark the URL unhealthy and move on.
            this.health.recordFailure(url);
            break;
          }
          strategy = next;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new GuildPassError(
          'All RPC URLs and strategies failed for batchEthCall',
          GuildPassErrorCode.HTTP_ERROR,
        );
  }

  /** Returns the next-lower strategy, or the same strategy at the floor. */
  private degrade(strategy: ReadStrategy): ReadStrategy {
    switch (strategy) {
      case ReadStrategy.MULTICALL3:
        return ReadStrategy.JSON_RPC_BATCH;
      case ReadStrategy.JSON_RPC_BATCH:
        return ReadStrategy.SEQUENTIAL;
      default:
        return ReadStrategy.SEQUENTIAL;
    }
  }

  /** Dispatches a batch to the concrete implementation for a strategy. */
  private async execute(
    url: string,
    strategy: ReadStrategy,
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    switch (strategy) {
      case ReadStrategy.MULTICALL3:
        return this.viaMulticall3(url, requests, options);
      case ReadStrategy.JSON_RPC_BATCH:
        return this.providerFor(url).batchEthCall(requests, options);
      case ReadStrategy.SEQUENTIAL:
      default:
        return this.viaSequential(url, requests, options);
    }
  }

  /**
   * Executes a batch as a single Multicall3 `aggregate3` call, then unpacks
   * the ABI-encoded `(bool success, bytes returnData)[]` tuple back into the
   * SDK's per-item `BatchItemResult[]`, preserving order.
   */
  private async viaMulticall3(
    url: string,
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    const calldata = encodeAggregate3(requests);
    const raw = await this.providerFor(url).ethCall(
      { to: MULTICALL3_ADDRESS, data: calldata },
      options,
    );
    if (typeof raw !== 'string') {
      throw new GuildPassError(
        'Multicall3 returned a non-string result',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }
    return decodeAggregate3(raw, requests.length);
  }

  /**
   * Executes a batch as independent sequential `eth_call`s. Individual
   * failures are captured per item (never rejecting the whole batch), so the
   * result shape matches JSON-RPC batch and Multicall3 exactly.
   */
  private async viaSequential(
    url: string,
    requests: EthCallRequest[],
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    const provider = this.providerFor(url);
    const results: BatchItemResult[] = [];
    for (const request of requests) {
      try {
        const result = await provider.ethCall(request, options);
        results.push({ status: 'success', result: typeof result === 'string' ? result : '0x' });
      } catch (err) {
        // A transient error here should bubble so the caller can fail the URL
        // over; a contract-level error is a legitimate per-item failure.
        if (isTransient(err)) throw err;
        results.push({
          status: 'error',
          error: err instanceof Error ? err.message : 'eth_call failed',
        });
      }
    }
    return results;
  }
}


