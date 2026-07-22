// GuildPass SDK: Import external module dependencies.
import { FetchLike, HttpHooks, RetryConfig, RateLimitConfig } from '../http/http.types';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { CacheAdapter } from '../cache/cache.types';
import { ChainConfig } from '../contracts/contract.types';
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
  apiKey?: string;
  timeoutMs?: number;
  /** Global retry policy applied to all requests. Defaults to no retries. */
  retry?: RetryConfig;
  hooks?: HttpHooks;
  fetch?: FetchLike;
  rateLimit?: RateLimitConfig;
  validateResponses?: boolean;
  cache?: CacheAdapter;
  cacheTtl?: number;
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
};

/**
 * Local helper to enforce structured configuration exceptions uniformly.
 */
const throwConfigError = (message: string, field: string, reason: string, value: any): never => {
  const isSensitive = ['apikey', 'secret', 'privatekey', 'password', 'apiurl'].includes(field.toLowerCase());
  throw new GuildPassError(message, GuildPassErrorCode.INVALID_CONFIG, undefined, {
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
      validateAddress(config.multicallAddress);
    } catch {
      throw new GuildPassError(
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
      validateAddress(config.trustedSignerAddress);
    } catch {
      throw new GuildPassError(
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

  validateChainsConfig(config.chains);

  const transport = config.fetch ?? globalThis.fetch;
  if (typeof transport !== 'function') {
    throwConfigError('A fetch-compatible transport is required.', 'fetch', 'required', null);
  }
}

function validateChainsConfig(chains?: Record<number, ChainConfig>): void {
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
        validateAddress(chainConfig.contractAddress);
      } catch (err: any) {
        throw new GuildPassError(
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
        validateAddress(chainConfig.multicallAddress);
      } catch (err: any) {
        throw new GuildPassError(
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
  if (config.chains) {
    if (Object.prototype.hasOwnProperty.call(config.chains, chainId)) {
      return config.chains[chainId];
    }
    throw new GuildPassError(
      `No configuration found for chain ID ${chainId}`,
      GuildPassErrorCode.INVALID_CONFIG,
      undefined,
      { field: 'chainId', reason: 'NOT_FOUND', value: chainId, valueType: 'number' }
    );
  }
  return {
    rpcUrl: config.rpcUrl,
    rpcUrls: config.rpcUrls,
    contractAddress: config.contractAddress,
    multicallAddress: config.multicallAddress,
  };
}