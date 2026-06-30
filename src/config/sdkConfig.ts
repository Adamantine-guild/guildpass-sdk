// GuildPass SDK: Import external module dependencies.
import { FetchLike, HttpHooks, RetryConfig } from '../http/http.types';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { CacheAdapter } from '../cache/cache.types';
import { ChainConfig } from '../contracts/contract.types';
import { validateAddress } from '../utils/validation';

// GuildPass SDK: Exported component definition.
export type GuildPassClientConfig = {
  apiUrl: string;
  chainId?: number;
  rpcUrl?: string;
  contractAddress?: string;
  /** Per-chain RPC URL and contract address overrides, keyed by chain ID. */
  chains?: Record<number, ChainConfig>;
  apiKey?: string;
  timeoutMs?: number;
  /** Global retry policy applied to all requests. Defaults to no retries. */
  retry?: RetryConfig;
  hooks?: HttpHooks;
  /**
   * Optional fetch-compatible transport for tests, tracing, proxies,
   * custom runtimes, or environments without globalThis.fetch.
   */
  fetch?: FetchLike;
  /**
   * When true, service responses are checked against runtime shape guards
   * before being returned, throwing a GuildPassError with code
   * INVALID_RESPONSE if the API response is malformed. Defaults to false
   * to preserve existing behaviour.
   */
  validateResponses?: boolean;
  /**
   * A cache adapter used to memoize read responses.
   *
   * Provide `new InMemoryCacheAdapter()` for a built-in solution, or supply
   * any object that satisfies the {@link CacheAdapter} interface (e.g. a
   * Redis adapter) for distributed caching.
   *
   * @example
   * ```typescript
   * import { GuildPassClient, InMemoryCacheAdapter } from '@guildpass/sdk';
   *
   * const client = new GuildPassClient({
   *   apiUrl: 'https://api.guildpass.xyz',
   *   cache: new InMemoryCacheAdapter(),
   *   cacheTtl: 60_000,
   * });
   * ```
   */
  cache?: CacheAdapter;
  /**
   * Default TTL in **milliseconds** applied to every cached entry when
   * a per-call TTL is not specified. Defaults to `0` (no expiry).
   */
  cacheTtl?: number;
  /**
   * Whether to send client metadata headers (`X-GuildPass-SDK-Version`,
   * `X-GuildPass-Client`) on GuildPass API-relative requests.
   *
   * Defaults to `true`. Set to `false` to disable all metadata headers.
   * Metadata headers never include API keys, wallet secrets, or tokens.
   */
  sendClientMetadata?: boolean;
  /**
   * Optional client or integration name (e.g. `"my-dapp"`, `"discord-bot"`).
   * Appears in the `X-GuildPass-Client` header alongside the SDK version.
   */
  clientName?: string;
  /**
   * Optional client version string sent as part of `X-GuildPass-Client`.
   * When omitted, only the client name is sent (if provided).
   */
  clientVersion?: string;
  // GuildPass SDK: End of logic containment structure block.
};

export function validateConfig(config: GuildPassClientConfig): void {
  if (!config.apiUrl) {
    throw new GuildPassError('apiUrl is required', GuildPassErrorCode.INVALID_CONFIG);
  }

  try {
    const url = new URL(config.apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new GuildPassError(
      `Invalid apiUrl: "${config.apiUrl}"`,
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (
    config.timeoutMs !== undefined &&
    (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0)
  ) {
    throw new GuildPassError(
      'timeoutMs must be a positive number',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  // INSERT CACHE VALIDATION 
  if (
    config.cacheTtl !== undefined &&
    (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0 || !Number.isFinite(config.cacheTtl))
  ) {
    throw new GuildPassError(
      'cacheTtl must be a non-negative finite number (milliseconds)',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (config.cache !== undefined) {
    const adapter = config.cache;
    const required = ['get', 'set', 'delete', 'clear'] as const;
    for (const method of required) {
      if (typeof adapter[method] !== 'function') {
        throw new GuildPassError(
          `cache adapter must implement ${method}(): function`,
          GuildPassErrorCode.INVALID_CONFIG,
        );
      }
    }
  }
  // END CACHE VALIDATION

  // INSERT METADATA VALIDATION
  if (
    config.sendClientMetadata !== undefined &&
    typeof config.sendClientMetadata !== 'boolean'
  ) {
    throw new GuildPassError(
      'sendClientMetadata must be a boolean',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (
    config.clientName !== undefined &&
    typeof config.clientName !== 'string'
  ) {
    throw new GuildPassError(
      'clientName must be a string',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }

  if (
    config.clientVersion !== undefined &&
    typeof config.clientVersion !== 'string'
  ) {
    throw new GuildPassError(
      'clientVersion must be a string',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }
  // END METADATA VALIDATION

  // INSERT RETRY VALIDATION
  if (config.retry) {
    const r = config.retry;

    if (r.maxRetries !== undefined && (typeof r.maxRetries !== 'number' || !Number.isFinite(r.maxRetries) || r.maxRetries < 0)) {
      throw new GuildPassError('retry.maxRetries must be a non-negative finite number', GuildPassErrorCode.INVALID_CONFIG);
    }

    if (r.baseDelayMs !== undefined && (typeof r.baseDelayMs !== 'number' || !Number.isFinite(r.baseDelayMs) || r.baseDelayMs < 0)) {
      throw new GuildPassError('retry.baseDelayMs must be a non-negative finite number', GuildPassErrorCode.INVALID_CONFIG);
    }

    if (r.maxDelayMs !== undefined && (typeof r.maxDelayMs !== 'number' || !Number.isFinite(r.maxDelayMs) || r.maxDelayMs < 0)) {
      throw new GuildPassError('retry.maxDelayMs must be a non-negative finite number', GuildPassErrorCode.INVALID_CONFIG);
    }

    if (r.baseDelayMs !== undefined && r.maxDelayMs !== undefined && r.maxDelayMs < r.baseDelayMs) {
      throw new GuildPassError('retry.maxDelayMs cannot be less than baseDelayMs', GuildPassErrorCode.INVALID_CONFIG);
    }

    if (r.retryableStatuses !== undefined && (!Array.isArray(r.retryableStatuses) || r.retryableStatuses.length === 0 || r.retryableStatuses.some((s) => typeof s !== 'number' || !Number.isFinite(s)))) {
      throw new GuildPassError('retryableStatuses must be a non-empty array of valid HTTP status numbers', GuildPassErrorCode.INVALID_CONFIG);
    }
  }
  // END RETRY VALIDATION 

  validateChainsConfig(config.chains);

  const transport = config.fetch ?? globalThis.fetch;
  if (typeof transport !== 'function') {
    throw new GuildPassError(
      'A fetch-compatible transport is required. Provide config.fetch or use a runtime with globalThis.fetch.',
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }
}

function validateChainsConfig(chains?: Record<number, ChainConfig>): void {
  if (!chains) {
    return;
  }

  for (const [chainIdKey, chainConfig] of Object.entries(chains)) {
    const chainId = Number(chainIdKey);

    if (!Number.isSafeInteger(chainId) || chainId <= 0 || String(chainId) !== chainIdKey) {
      throw new GuildPassError(
        `Invalid chains[${chainIdKey}]: chain ID must be a positive safe integer`,
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (chainConfig.rpcUrl !== undefined) {
      validateChainRpcUrl(chainIdKey, chainConfig.rpcUrl);
    }

    if (chainConfig.contractAddress !== undefined) {
      validateChainContractAddress(chainIdKey, chainConfig.contractAddress);
    }
  }
}

function validateChainRpcUrl(chainIdKey: string, rpcUrl: string): void {
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new GuildPassError(
      `Invalid chains[${chainIdKey}].rpcUrl: expected an http or https URL`,
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }
}

function validateChainContractAddress(chainIdKey: string, contractAddress: string): void {
  try {
    validateAddress(contractAddress);
  } catch {
    throw new GuildPassError(
      `Invalid chains[${chainIdKey}].contractAddress: expected a valid EVM address`,
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }
}
/**
 * Resolves the chain configuration for a given chain ID.
 * Per-chain entries in `config.chains` take precedence over the top-level
 * `rpcUrl` / `contractAddress` fallbacks.
 * Throws `INVALID_CONFIG` only when a `chains` map is provided but does not
 * contain an entry for the requested chain.
 */
export function resolveChainConfig(config: GuildPassClientConfig, chainId: number): ChainConfig {
  if (config.chains) {
    if (Object.prototype.hasOwnProperty.call(config.chains, chainId)) {
      return config.chains[chainId];
    }
    throw new GuildPassError(
      `No configuration found for chain ID ${chainId}`,
      GuildPassErrorCode.INVALID_CONFIG,
    );
  }
  return { rpcUrl: config.rpcUrl, contractAddress: config.contractAddress };
}
