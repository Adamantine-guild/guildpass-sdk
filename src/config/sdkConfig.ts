// GuildPass SDK: Import external module dependencies.
import { FetchLike, HttpHooks, RetryConfig } from '../http/http.types';
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
   * Custom provider used for all contract reads. Takes precedence over
   * `rpcUrl` (including per-chain `chains[].rpcUrl`). Use the adapters in
   * `@guildpass/sdk/adapters/viem` or `@guildpass/sdk/adapters/ethers` to
   * wrap an existing viem PublicClient or ethers Provider.
   */
  contractProvider?: ContractProvider;
  contractAddress?: string;
  /** Per-chain RPC URL and contract address overrides, keyed by chain ID. */
  chains?: Record<number, ChainConfig>;
  apiKey?: string;
  timeoutMs?: number;
  /** Global retry policy applied to all requests. Defaults to no retries. */
  retry?: RetryConfig;
  hooks?: HttpHooks;
  fetch?: FetchLike;
  validateResponses?: boolean;
  cache?: CacheAdapter;
  cacheTtl?: number;
  sendClientMetadata?: boolean;
  clientName?: string;
  clientVersion?: string;
};

/**
 * Local helper to enforce structured configuration exceptions uniformly.
 */
const throwConfigError = (message: string, field: string, reason: string, value: any): never => {
  const isSensitive = ['apikey', 'secret', 'privatekey', 'password'].includes(field.toLowerCase());
  throw new GuildPassError(message, GuildPassErrorCode.INVALID_CONFIG, undefined, {
    field,
    reason,
    ...(isSensitive ? {} : { value }),
    valueType: typeof value,
  });
};

export function validateConfig(config: GuildPassClientConfig): void {
  if (!config.apiUrl) {
    throwConfigError('apiUrl is required', 'apiUrl', 'REQUIRED', config.apiUrl);
  }

  try {
    const url = new URL(config.apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throwConfigError(`Invalid apiUrl: "${config.apiUrl}"`, 'apiUrl', 'INVALID_FORMAT', config.apiUrl);
  }

  if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0)) {
    throwConfigError('timeoutMs must be a positive number', 'timeoutMs', 'INVALID_FORMAT', config.timeoutMs);
  }

  if (config.cacheTtl !== undefined && (typeof config.cacheTtl !== 'number' || config.cacheTtl < 0 || !Number.isFinite(config.cacheTtl))) {
    throwConfigError('cacheTtl must be a non-negative finite number (milliseconds)', 'cacheTtl', 'INVALID_FORMAT', config.cacheTtl);
  }

  if (config.cache !== undefined) {
    const adapter = config.cache;
    const required = ['get', 'set', 'delete', 'clear'] as const;
    for (const method of required) {
      if (typeof adapter[method] !== 'function') {
        throwConfigError(`cache adapter must implement ${method}(): function`, 'cache', 'INVALID_TYPE', config.cache);
      }
    }
  }

  if (config.contractProvider !== undefined) {
    const provider = config.contractProvider;
    const required = ['ethCall', 'batchEthCall'] as const;
    for (const method of required) {
      if (typeof provider[method] !== 'function') {
        throwConfigError(`contractProvider must implement ${method}(): function`, 'contractProvider', 'INVALID_TYPE', config.contractProvider);
      }
    }
  }

  if (config.sendClientMetadata !== undefined && typeof config.sendClientMetadata !== 'boolean') {
    throwConfigError('sendClientMetadata must be a boolean', 'sendClientMetadata', 'INVALID_TYPE', config.sendClientMetadata);
  }

  if (config.clientName !== undefined && typeof config.clientName !== 'string') {
    throwConfigError('clientName must be a string', 'clientName', 'INVALID_TYPE', config.clientName);
  }

  if (config.clientVersion !== undefined && typeof config.clientVersion !== 'string') {
    throwConfigError('clientVersion must be a string', 'clientVersion', 'INVALID_TYPE', config.clientVersion);
  }

  if (config.retry) {
    const r = config.retry;

    if (r.maxRetries !== undefined && (typeof r.maxRetries !== 'number' || !Number.isFinite(r.maxRetries) || r.maxRetries < 0)) {
      throwConfigError('retry.maxRetries must be a non-negative finite number', 'retry.maxRetries', 'INVALID_FORMAT', r.maxRetries);
    }

    if (r.baseDelayMs !== undefined && (typeof r.baseDelayMs !== 'number' || !Number.isFinite(r.baseDelayMs) || r.baseDelayMs < 0)) {
      throwConfigError('retry.baseDelayMs must be a non-negative finite number', 'retry.baseDelayMs', 'INVALID_FORMAT', r.baseDelayMs);
    }

    if (r.maxDelayMs !== undefined && (typeof r.maxDelayMs !== 'number' || !Number.isFinite(r.maxDelayMs) || r.maxDelayMs < 0)) {
      throwConfigError('retry.maxDelayMs must be a non-negative finite number', 'retry.maxDelayMs', 'INVALID_FORMAT', r.maxDelayMs);
    }

    if (r.baseDelayMs !== undefined && r.maxDelayMs !== undefined && r.maxDelayMs < r.baseDelayMs) {
      throwConfigError('retry.maxDelayMs cannot be less than baseDelayMs', 'retry.maxDelayMs', 'INVALID_FORMAT', r.maxDelayMs);
    }

    if (r.retryableStatuses !== undefined && (!Array.isArray(r.retryableStatuses) || r.retryableStatuses.length === 0 || r.retryableStatuses.some((s) => typeof s !== 'number' || !Number.isFinite(s)))) {
      throwConfigError('retryableStatuses must be a non-empty array of valid HTTP status numbers', 'retry.retryableStatuses', 'INVALID_FORMAT', r.retryableStatuses);
    }
  }

  if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
    throwConfigError('apiKey must be a string', 'apiKey', 'INVALID_TYPE', config.apiKey);
  }

  validateChainsConfig(config.chains);

  const transport = config.fetch ?? globalThis.fetch;
  if (typeof transport !== 'function') {
    throwConfigError('A fetch-compatible transport is required.', 'fetch', 'REQUIRED', null);
  }
}

function validateChainsConfig(chains?: Record<number, ChainConfig>): void {
  if (!chains) return;

  for (const [chainIdKey, chainConfig] of Object.entries(chains)) {
    const chainId = Number(chainIdKey);

    if (!Number.isSafeInteger(chainId) || chainId <= 0 || String(chainId) !== chainIdKey) {
      throwConfigError(`Invalid chains[${chainIdKey}]: chain ID must be a positive safe integer`, `chains.${chainIdKey}`, 'INVALID_FORMAT', chainIdKey);
    }

    if (chainConfig.rpcUrl !== undefined) {
      try {
        const url = new URL(chainConfig.rpcUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
      } catch {
        throwConfigError(`Invalid chains[${chainIdKey}].rpcUrl: expected an http or https URL`, `chains.${chainIdKey}.rpcUrl`, 'INVALID_FORMAT', chainConfig.rpcUrl);
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
            reason: 'INVALID_FORMAT',
            value: chainConfig.contractAddress,
            valueType: 'string',
          }
        );
      }
    }
  }
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
  return { rpcUrl: config.rpcUrl, contractAddress: config.contractAddress };
}