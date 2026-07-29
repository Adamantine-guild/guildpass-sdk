// GuildPass SDK: Import external module dependencies.
import { FetchLike, HttpHooks, RetryConfig, RateLimitConfig } from '../http/http.types';
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';
import type { CacheAdapter } from '../cache/cache.types';
import type { Middleware } from '../middleware/middleware.types';
import type { AuthenticationProvider } from '../auth/AuthenticationProvider';
import { ChainConfig, ContractReadConsensus } from '../contracts/contract.types';
import { ContractProvider } from '../contracts/providers/provider.types';
import { validateAddress } from '../utils/validation';

export type GuildPassClientConfig = {
  apiUrl: string;
  chainId?: number;
  rpcUrl?: string;
  /**
   * Ordered list of fallback RPC endpoint URLs for the default chain.
   * When a call to the first URL fails with a transient error (network
   * issue, 429, 5xx, timeout) the next URL is tried automatically.
   *
   * `rpcUrl` (singular) is still supported for single-provider setups and
   * is automatically prepended to this list when both are provided.
   */
  rpcUrls?: string[];
  /**
   * Custom provider used for all contract reads. Takes precedence over
   * `rpcUrl` / `rpcUrls` (including per-chain `chains[].rpcUrl` /
   * `chains[].rpcUrls`). Use the adapters in
   * `@guildpass/sdk/adapters/viem` or `@guildpass/sdk/adapters/ethers` to
   * wrap an existing viem PublicClient or ethers Provider.
   */
  contractProvider?: ContractProvider;
  contractAddress?: string;
  multicallAddress?: string;
  batchStrategy?: 'jsonrpc' | 'multicall3';
  /** Per-chain RPC URL and contract address overrides, keyed by chain ID. */
  chains?: Record<number, ChainConfig>;
  authProvider?: AuthenticationProvider;
  apiKey?: string;
  timeoutMs?: number;
  /**
   * Client-wide default request timeout in milliseconds. Applied to every
   * request that doesn't pass its own per-request `timeoutMs`, and rejects
   * with a `TIMEOUT` error when exceeded.
   *
   * Preferred over `timeoutMs` (which is kept for backward compatibility).
   * If both are set they must be equal; `defaultTimeoutMs` wins when only it
   * is provided.
   */
  defaultTimeoutMs?: number;
  /** Global retry policy applied to all requests. Defaults to no retries. */
  retry?: RetryConfig;
  hooks?: HttpHooks;
  middleware?: Middleware[];
  fetch?: FetchLike;
  transport?: import('../network/transport.types').HttpTransport;
  rateLimit?: RateLimitConfig;
  /**
   * Validates every API response against its expected shape before
   * returning it to the caller — see `docs/serialization-validation.md`.
   * Unknown/extra fields are always passed through untouched; only missing
   * required fields or wrong primitive types fail validation. On mismatch,
   * throws `GuildPassResponseValidationError` (code `INVALID_RESPONSE`)
   * naming the offending field, endpoint, and what was received.
   *
   * Set to `false` to restore the pre-validation behavior of returning
   * whatever the server sent, unchecked.
   *
   * @default true
   */
  validateResponses?: boolean;
  /** Enforces EIP-55 checksums for all addresses accepted by the SDK. @default false */
  strictAddressChecksum?: boolean;
  cache?: CacheAdapter;
  cacheTtl?: number;
  /**
   * When enabled (default), identical in-flight read requests are
   * deduplicated: concurrent calls with the same arguments share a single
   * underlying HTTP request instead of each issuing their own.
   *
   * Disable this if your application requires every call to hit the network
   * independently (e.g. for per-call abort semantics or debugging). Can be
   * overridden per call via `RequestOptions.deduplicate`.
   *
   * @default true
   */
  deduplication?: boolean;
  sendClientMetadata?: boolean;
  clientName?: string;
  clientVersion?: string;
  /**
   * When enabled, the SDK verifies (via ERC-165 `supportsInterface`) that the
   * target contract implements the expected interface before evaluating TOKEN,
   * NFT, or ROLE requirements. If the contract both implements ERC-165 *and*
   * reports it does NOT support the expected interface, validation fails closed
   * with an `INVALID_CONFIG` error.
   *
   * Non-ERC-165 contracts (e.g. many ERC-20 tokens) are always allowed through
   * regardless of this flag, preserving backward compatibility.
   *
   * @default false
   */
  strictInterfaceChecking?: boolean;
  /**
   * When enabled, the SDK verifies that Access Decisions and Guild Configuration
   * responses from the API are properly signed by the `trustedSignerAddress`.
   * Requires the API to return a signed envelope.
   *
   * @default false
   */
  verifySignedResponses?: boolean;
  /**
   * The expected Ethereum address of the GuildPass signing key.
   * Must be provided if `verifySignedResponses` is enabled.
   */
  trustedSignerAddress?: string;
  /**
   * Opt-in cross-provider consensus verification for read-only contract
   * calls (see issue #307). When set, single-call contract reads are
   * issued in parallel against every URL listed in `consensus.providers`,
   * and only returned when at least `consensus.minProviders` of them
   * agree on the same raw hex result.
   *
   * When NOT set (default), behavior is unchanged: the SDK falls back to
   * its existing single-RPC-failover path (`rpcUrls` / `chains[].rpcUrls`).
   * When both this field and `contractProvider` are set, `contractProvider`
   * takes precedence — callers who want consensus over a custom provider
   * must layer the verification themselves.
   */
  contractReadConsensus?: ContractReadConsensus;
  /**
   * Optional configuration for the real-time cache invalidation watcher.
   */
  watcher?: {
    /** 
     * How often to poll for new blocks in milliseconds when using an HTTP RPC URL.
     * Default: 10000 (10s)
     */
    pollingIntervalMs?: number;
  };
};

/**
 * Shape returned by `GuildPassClient.getConfig()`: the client config minus
 * the API key and every function-valued or non-serializable field, with
 * credentials redacted from RPC URLs.
 */
export type PublicClientConfig = Omit<
  GuildPassClientConfig,
  'apiKey' | 'fetch' | 'transport' | 'hooks' | 'contractProvider' | 'cache' | 'middleware' | 'authProvider'
>;

/**
 * Local helper to enforce structured configuration exceptions uniformly.
 */
const throwConfigError = (message: string, field: string, reason: string, value: any): never => {
  const isSensitive = ['apikey', 'secret', 'privatekey', 'password', 'apiurl'].includes(field.toLowerCase());
  throw new GuildPassConfigError(message, GuildPassErrorCode.INVALID_CONFIG, undefined, {
    field,
    reason,
    ...(isSensitive ? {} : { value }),
    valueType: typeof value,
  });
};

export function validateConfig(config: GuildPassClientConfig): void {
  if (!config.apiUrl) {
    throwConfigError('apiUrl is required', 'apiUrl', 'required', config.apiUrl);
  }

  try {
    const url = new URL(config.apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throwConfigError(`Invalid apiUrl: "${config.apiUrl}"`, 'apiUrl', 'format', config.apiUrl);
  }

  if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0)) {
    throwConfigError('timeoutMs must be a positive number', 'timeoutMs', 'invalid_type', config.timeoutMs);
  }

  if (config.defaultTimeoutMs !== undefined && (typeof config.defaultTimeoutMs !== 'number' || config.defaultTimeoutMs <= 0 || !Number.isFinite(config.defaultTimeoutMs))) {
    throwConfigError('defaultTimeoutMs must be a positive finite number', 'defaultTimeoutMs', 'invalid_type', config.defaultTimeoutMs);
  }

  if (config.defaultTimeoutMs !== undefined && config.timeoutMs !== undefined && config.defaultTimeoutMs !== config.timeoutMs) {
    throwConfigError('defaultTimeoutMs and timeoutMs are aliases; set only one, or set both to the same value', 'defaultTimeoutMs', 'conflict', config.defaultTimeoutMs);
  }

  if (config.cacheTtl !== undefined && (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0 || !Number.isFinite(config.cacheTtl))) {
    throwConfigError('cacheTtl must be a non-negative finite number (milliseconds)', 'cacheTtl', 'invalid_range', config.cacheTtl);
  }

  if (config.cache !== undefined) {
    const adapter = config.cache;
    const required = ['get', 'set', 'delete', 'clear'] as const;
    for (const method of required) {
      if (typeof adapter[method] !== 'function') {
        throwConfigError(`cache adapter must implement ${method}(): function`, 'cache', 'invalid_type', config.cache);
      }
    }
  }

  if (config.deduplication !== undefined && typeof config.deduplication !== 'boolean') {
    throwConfigError('deduplication must be a boolean', 'deduplication', 'invalid_type', config.deduplication);
  }

  if (config.strictAddressChecksum !== undefined && typeof config.strictAddressChecksum !== 'boolean') {
    throwConfigError('strictAddressChecksum must be a boolean', 'strictAddressChecksum', 'invalid_type', config.strictAddressChecksum);
  }

  if (config.contractProvider !== undefined) {
    const provider = config.contractProvider;
    const required = ['ethCall', 'batchEthCall'] as const;
    for (const method of required) {
      if (typeof provider[method] !== 'function') {
        throwConfigError(`contractProvider must implement ${method}(): function`, 'contractProvider', 'invalid_type', config.contractProvider);
      }
    }
  }

  if (config.batchStrategy !== undefined && config.batchStrategy !== 'jsonrpc' && config.batchStrategy !== 'multicall3') {
    throwConfigError("batchStrategy must be 'jsonrpc' or 'multicall3'", 'batchStrategy', 'invalid_value', config.batchStrategy);
  }

  if (config.multicallAddress !== undefined) {
    try {
      validateAddress(config.multicallAddress, { strict: config.strictAddressChecksum });
    } catch {
      throw new GuildPassConfigError(
        'Invalid multicallAddress: expected a valid EVM address',
        GuildPassErrorCode.INVALID_CONFIG,
        undefined,
        {
          field: 'multicallAddress',
          reason: 'format',
          value: config.multicallAddress,
          valueType: 'string',
        }
      );
    }
  }

  if (config.sendClientMetadata !== undefined && typeof config.sendClientMetadata !== 'boolean') {
    throwConfigError('sendClientMetadata must be a boolean', 'sendClientMetadata', 'invalid_type', config.sendClientMetadata);
  }

  if (config.strictInterfaceChecking !== undefined && typeof config.strictInterfaceChecking !== 'boolean') {
    throwConfigError('strictInterfaceChecking must be a boolean', 'strictInterfaceChecking', 'invalid_type', config.strictInterfaceChecking);
  }

  if (config.verifySignedResponses !== undefined && typeof config.verifySignedResponses !== 'boolean') {
    throwConfigError('verifySignedResponses must be a boolean', 'verifySignedResponses', 'invalid_type', config.verifySignedResponses);
  }

  if (config.trustedSignerAddress !== undefined) {
    try {
      validateAddress(config.trustedSignerAddress, { strict: config.strictAddressChecksum });
    } catch {
      throw new GuildPassConfigError(
        'Invalid trustedSignerAddress: expected a valid EVM address',
        GuildPassErrorCode.INVALID_CONFIG,
        undefined,
        {
          field: 'trustedSignerAddress',
          reason: 'format',
          value: config.trustedSignerAddress,
          valueType: 'string',
        }
      );
    }
  }

  if (config.verifySignedResponses && !config.trustedSignerAddress) {
    throwConfigError('trustedSignerAddress must be provided when verifySignedResponses is enabled', 'trustedSignerAddress', 'required', config.trustedSignerAddress);
  }

  if (config.clientName !== undefined && typeof config.clientName !== 'string') {
    throwConfigError('clientName must be a string', 'clientName', 'invalid_type', config.clientName);
  }

  if (config.clientVersion !== undefined && typeof config.clientVersion !== 'string') {
    throwConfigError('clientVersion must be a string', 'clientVersion', 'invalid_type', config.clientVersion);
  }

  if (config.retry) {
    const r = config.retry;

    if (r.maxRetries !== undefined && (typeof r.maxRetries !== 'number' || !Number.isFinite(r.maxRetries) || r.maxRetries < 0)) {
      throwConfigError('retry.maxRetries must be a non-negative finite number', 'retry.maxRetries', 'invalid_range', r.maxRetries);
    }

    if (r.baseDelayMs !== undefined && (typeof r.baseDelayMs !== 'number' || !Number.isFinite(r.baseDelayMs) || r.baseDelayMs < 0)) {
      throwConfigError('retry.baseDelayMs must be a non-negative finite number', 'retry.baseDelayMs', 'invalid_range', r.baseDelayMs);
    }

    if (r.maxDelayMs !== undefined && (typeof r.maxDelayMs !== 'number' || !Number.isFinite(r.maxDelayMs) || r.maxDelayMs < 0)) {
      throwConfigError('retry.maxDelayMs must be a non-negative finite number', 'retry.maxDelayMs', 'invalid_range', r.maxDelayMs);
    }

    if (r.baseDelayMs !== undefined && r.maxDelayMs !== undefined && r.maxDelayMs < r.baseDelayMs) {
      throwConfigError('retry.maxDelayMs cannot be less than baseDelayMs', 'retry.maxDelayMs', 'invalid_range', r.maxDelayMs);
    }

    if (r.retryableStatuses !== undefined && (!Array.isArray(r.retryableStatuses) || r.retryableStatuses.length === 0 || r.retryableStatuses.some((s) => typeof s !== 'number' || !Number.isFinite(s)))) {
      throwConfigError('retryableStatuses must be a non-empty array of valid HTTP status numbers', 'retry.retryableStatuses', 'invalid_type', r.retryableStatuses);
    }

    if (r.jitter !== undefined && typeof r.jitter !== 'boolean') {
      throwConfigError('retry.jitter must be a boolean', 'retry.jitter', 'invalid_type', r.jitter);
    }
  }

  if (config.rateLimit) {
    const rl = config.rateLimit;
    if (typeof rl.requestsPerSecond !== 'number' || rl.requestsPerSecond <= 0 || !Number.isFinite(rl.requestsPerSecond)) {
      throwConfigError(
        'rateLimit.requestsPerSecond must be a positive finite number',
        'rateLimit.requestsPerSecond',
        'invalid_range',
        rl.requestsPerSecond,
      );
    }
    if (rl.burst !== undefined && (typeof rl.burst !== 'number' || rl.burst < 1 || !Number.isFinite(rl.burst))) {
      throwConfigError(
        'rateLimit.burst must be a positive finite number >= 1',
        'rateLimit.burst',
        'invalid_range',
        rl.burst,
      );
    }
  }

  if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
    throwConfigError('apiKey must be a string', 'apiKey', 'invalid_type', config.apiKey);
  }

  if (config.authProvider !== undefined && (typeof config.authProvider !== 'object' || config.authProvider === null)) {
    throwConfigError('authProvider must be an object implementing AuthenticationProvider', 'authProvider', 'invalid_type', config.authProvider);
  }

  if (config.rpcUrls !== undefined) {
    if (!Array.isArray(config.rpcUrls) || config.rpcUrls.length === 0) {
      throwConfigError(
        'rpcUrls must be a non-empty array of http/https URLs',
        'rpcUrls',
        'INVALID_FORMAT',
        config.rpcUrls,
      );
    }
    for (const [idx, url] of config.rpcUrls.entries()) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        throwConfigError(
          `Invalid rpcUrls[${idx}]: expected an http or https URL`,
          `rpcUrls[${idx}]`,
          'INVALID_FORMAT',
          url,
        );
      }
    }
  }

  validateContractReadConsensus(config.contractReadConsensus);

  validateChainsConfig(config.chains, config.strictAddressChecksum);

  const transportFallback = config.fetch ?? globalThis.fetch;
  if (!config.transport && typeof transportFallback !== 'function') {
    throwConfigError('A fetch-compatible transport or custom transport is required.', 'transport', 'required', null);
  }
}

function validateChainsConfig(chains?: Record<number, ChainConfig>, strictAddressChecksum = false): void {
  if (!chains) return;

  for (const [chainIdKey, chainConfig] of Object.entries(chains)) {
    const chainId = Number(chainIdKey);

    if (!Number.isSafeInteger(chainId) || chainId <= 0 || String(chainId) !== chainIdKey) {
      throwConfigError(`Invalid chains[${chainIdKey}]: chain ID must be a positive safe integer`, `chains.${chainIdKey}`, 'format', chainIdKey);
    }

    if (chainConfig.rpcUrl !== undefined) {
      try {
        const url = new URL(chainConfig.rpcUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
      } catch {
        throwConfigError(`Invalid chains[${chainIdKey}].rpcUrl: expected an http or https URL`, `chains.${chainIdKey}.rpcUrl`, 'format', chainConfig.rpcUrl);
      }
    }

    if (chainConfig.rpcUrls !== undefined) {
      if (!Array.isArray(chainConfig.rpcUrls) || chainConfig.rpcUrls.length === 0) {
        throwConfigError(
          `chains[${chainIdKey}].rpcUrls must be a non-empty array of http/https URLs`,
          `chains.${chainIdKey}.rpcUrls`,
          'INVALID_FORMAT',
          chainConfig.rpcUrls,
        );
      }
      for (const [idx, url] of chainConfig.rpcUrls.entries()) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
        } catch {
          throwConfigError(
            `Invalid chains[${chainIdKey}].rpcUrls[${idx}]: expected an http or https URL`,
            `chains.${chainIdKey}.rpcUrls[${idx}]`,
            'INVALID_FORMAT',
            url,
          );
        }
      }
    }

    if (chainConfig.contractAddress !== undefined) {
      try {
        validateAddress(chainConfig.contractAddress, { strict: strictAddressChecksum });
      } catch (err: any) {
        throw new GuildPassConfigError(
          `Invalid chains[${chainIdKey}].contractAddress: expected a valid EVM address`,
          GuildPassErrorCode.INVALID_CONFIG,
          undefined,
          {
            field: `chains.${chainIdKey}.contractAddress`,
            reason: 'format',
            value: chainConfig.contractAddress,
            valueType: 'string',
          }
        );
      }
    }

    if (chainConfig.multicallAddress !== undefined) {
      try {
        validateAddress(chainConfig.multicallAddress, { strict: strictAddressChecksum });
      } catch (err: any) {
        throw new GuildPassConfigError(
          `Invalid chains[${chainIdKey}].multicallAddress: expected a valid EVM address`,
          GuildPassErrorCode.INVALID_CONFIG,
          undefined,
          {
            field: `chains.${chainIdKey}.multicallAddress`,
            reason: 'format',
            value: chainConfig.multicallAddress,
            valueType: 'string',
          }
        );
      }
    }
  }
}

/**
 * Validates the opt-in `contractReadConsensus` configuration. Called from
 * {@link validateConfig}; safe to call independently for tests.
 *
 * A quorum of one provider is explicitly rejected (`minProviders` must be ≥ 2)
 * because a single endpoint cannot detect a *responding-but-lying* provider,
 * which is the precise threat consensus mode is designed to mitigate.
 *
 * @internal
 */
export function validateContractReadConsensus(
  consensus: ContractReadConsensus | undefined,
): void {
  if (consensus === undefined) return;

  if (
    !consensus ||
    typeof consensus !== 'object' ||
    consensus === null ||
    Array.isArray(consensus)
  ) {
    throwConfigError(
      'contractReadConsensus must be an object with `providers` and `minProviders`',
      'contractReadConsensus',
      'invalid_type',
      consensus as any,
    );
  }

  const { providers, minProviders } = consensus;

  if (!Array.isArray(providers) || providers.length === 0) {
    throwConfigError(
      'contractReadConsensus.providers must be a non-empty array of http/https URLs',
      'contractReadConsensus.providers',
      'INVALID_FORMAT',
      providers,
    );
  }

  // Reject duplicates so the per-provider attribution in error messages is
  // unambiguous: a duplicated URL would otherwise inflate the apparent
  // "agreeing" count from a single physical endpoint.
  const seen = new Set<string>();
  for (const [idx, url] of providers.entries()) {
    if (typeof url !== 'string' || url.length === 0) {
      throwConfigError(
        `contractReadConsensus.providers[${idx}] must be a non-empty string`,
        `contractReadConsensus.providers[${idx}]`,
        'invalid_type',
        url,
      );
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    } catch {
      throwConfigError(
        `Invalid contractReadConsensus.providers[${idx}]: expected an http or https URL`,
        `contractReadConsensus.providers[${idx}]`,
        'INVALID_FORMAT',
        url,
      );
    }
    if (seen.has(url)) {
      throwConfigError(
        `contractReadConsensus.providers[${idx}]: duplicate URL "${url}"`,
        `contractReadConsensus.providers[${idx}]`,
        'duplicate',
        url,
      );
    }
    seen.add(url);
  }

  if (
    typeof minProviders !== 'number' ||
    !Number.isInteger(minProviders) ||
    minProviders < 2
  ) {
    throwConfigError(
      'contractReadConsensus.minProviders must be an integer >= 2 (a quorum of one cannot detect a lying RPC)',
      'contractReadConsensus.minProviders',
      'invalid_range',
      minProviders,
    );
  }

  if (minProviders > providers.length) {
    throwConfigError(
      `contractReadConsensus.minProviders (${minProviders}) cannot exceed the number of providers (${providers.length})`,
      'contractReadConsensus.minProviders',
      'invalid_range',
      minProviders,
    );
  }
}

/**
 * Merges `rpcUrl` (singular) and `rpcUrls` (array) into a single deduplicated
 * ordered list. `rpcUrl` is always prepended (if provided and not already
 * present) so it remains the highest-priority endpoint.
 *
 * @internal
 */
export function mergeRpcUrls(rpcUrl?: string, rpcUrls?: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of [rpcUrl, ...(rpcUrls ?? [])]) {
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

export function resolveChainConfig(config: GuildPassClientConfig, chainId: number): ChainConfig {
  const topLevel: ChainConfig = {
    rpcUrl: config.rpcUrl,
    rpcUrls: config.rpcUrls,
    contractAddress: config.contractAddress,
    multicallAddress: config.multicallAddress,
  };

  if (!config.chains) return topLevel;

  const hasEntry = Object.prototype.hasOwnProperty.call(config.chains, chainId);
  const entry = hasEntry ? config.chains[chainId] : undefined;

  // `chains` entries are documented as per-chain *overrides* (see README), so an
  // entry that sets only one field still inherits the rest from the top level.
  // Merging field by field rather than spreading matters: `{ ...topLevel, ...entry }`
  // would let a field the entry declares as `undefined` clobber a usable top-level
  // value, which is replacement, not override.
  const merged: ChainConfig = {
    rpcUrl: entry?.rpcUrl ?? topLevel.rpcUrl,
    rpcUrls: entry?.rpcUrls ?? topLevel.rpcUrls,
    contractAddress: entry?.contractAddress ?? topLevel.contractAddress,
    multicallAddress: entry?.multicallAddress ?? topLevel.multicallAddress,
  };

  const missing: string[] = [];
  // `rpcUrl` and `rpcUrls` are interchangeable inputs to the same list, so the
  // question is whether the merge yields any usable endpoint — not whether the
  // singular field happens to be set. Using `!merged.rpcUrl` here would report a
  // false "missing rpcUrl" for a config that only supplies `rpcUrls`.
  const hasRpc = mergeRpcUrls(merged.rpcUrl, merged.rpcUrls).length > 0;
  if (!hasRpc) missing.push('rpcUrl');
  if (!merged.contractAddress) missing.push('contractAddress');

  // Only a missing RPC endpoint makes the chain genuinely unresolvable. A missing
  // `contractAddress` does not: it can be supplied per call (`params.contractAddress`),
  // several methods take it as a required argument anyway, and the call sites raise
  // their own more specific errors ("contractAddress is required for token balance
  // lookup", etc.). Throwing on it here would reject configurations that work today.
  // It is still named in the message when it is absent too, which is the combined
  // case the issue quotes.
  if (!hasRpc) {
    throw new GuildPassConfigError(
      `No ${missing.join('/')} configured for chainId ${chainId}`,
      GuildPassErrorCode.INVALID_CONFIG,
      undefined,
      {
        field: 'chainId',
        reason: hasEntry ? 'INCOMPLETE' : 'NOT_FOUND',
        value: chainId,
        valueType: 'number',
        missing,
      }
    );
  }

  return merged;
}
