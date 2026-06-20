// GuildPass SDK: Import external module dependencies.
import { HttpHooks } from '../http/http.types';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { RetryConfig } from '../http/http.types';
import { ChainConfig } from '../contracts/contract.types';

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
   * When true, service responses are checked against runtime shape guards
   * before being returned, throwing a GuildPassError with code
   * INVALID_RESPONSE if the API response is malformed. Defaults to false
   * to preserve existing behaviour.
   */
  validateResponses?: boolean;
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
