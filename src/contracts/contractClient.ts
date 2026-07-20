// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
// GuildPass SDK: Import external module dependencies.
import {
  BatchEthCallItem,
  BatchItemResult,
  FormattedTokenBalance,
  GuildOwnerParams,
  GuildOwnersBatchParams,
  RoleRequirementParams,
  TokenBalanceParams,
  TokenBalancesBatchParams,
} from './contract.types';
// GuildPass SDK: Pull in package or module bindings.
import {
  BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  DECIMALS_SELECTOR, // <-- ADD THIS IMPORT
  HEX_32_BYTES_LENGTH,
  decodeAddressResult,
  decodeUint256Result,
  encodeAddressArgument,
  encodeGuildId,
  validateAccessRequirement,
} from './contractHelpers';
import { GuildPassClientConfig, resolveChainConfig, mergeRpcUrls } from '../config/sdkConfig';
import { HttpClient } from '../http/httpClient';
import { RequestOptions } from '../types/common';
import { ContractProvider } from './providers/provider.types';
import { JsonRpcContractProvider } from './providers/jsonRpcProvider';

// Local pure helper function for exact decimal string shift math
export const formatUnits = (value: string, decimals: number): string => {
  // Guard against negative decimal counts or non-integers
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error('Decimals must be a non-negative integer');
  }

  // Guard against invalid base unit numeric strings (letters or pre-existing decimals)
  if (!/^\d+$/.test(value)) {
    throw new Error('Value must be a valid big integer string containing only digits');
  }

  if (value === '0' || !value) return '0';

  const padded = value.padStart(decimals + 1, '0');
  const loc = padded.length - decimals;
  const whole = padded.slice(0, loc);
  let fraction = padded.slice(loc).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

export {
  BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  DECIMALS_SELECTOR, // <-- ADD THIS EXPORT
  HEX_32_BYTES_LENGTH,
  decodeAddressResult,
  decodeUint256Result,
  encodeAddressArgument,
  encodeGuildId,
};



// GuildPass SDK: Exported function execution unit.
export class ContractClient {
  // GuildPass SDK: Class member structure property or constructor.
  private readonly config: GuildPassClientConfig;
  private readonly http: HttpClient;

  // GuildPass SDK: Class member structure property or constructor.
  constructor(config: GuildPassClientConfig, http?: HttpClient) {
    this.config = config;
    this.http =
      http ??
      new HttpClient(config.apiUrl, config.apiKey, config.timeoutMs, {
        retry: config.retry,
        hooks: config.hooks,
        fetch: config.fetch,
      });
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Resolves the RPC URL and contract address for the given chain ID (or the
   * client's default chainId when omitted).
   */
  public getChainConfig(chainId?: number) {
    const id = chainId ?? this.config.chainId;
    if (id === undefined) {
      return { rpcUrl: this.config.rpcUrl, contractAddress: this.config.contractAddress };
    }
    return resolveChainConfig(this.config, id);
  }

  /**
   * Resolves the {@link ContractProvider} used for contract reads. A
   * configured `contractProvider` takes precedence; otherwise the default
   * raw JSON-RPC provider is constructed from the merged `rpcUrls` list
   * (deduplicated union of `rpcUrl` and `rpcUrls`). Throws
   * `INVALID_CONFIG` with `requiredMessage` when neither is available.
   *
   * When multiple RPC URLs are resolved, the provider automatically tries
   * them in order: if the primary URL fails with a transient error (network
   * failure, rate-limit, 5xx), the next URL is attempted transparently.
   */
  private resolveProvider(
    chainConfig: { rpcUrl?: string; rpcUrls?: string[] } | string | undefined,
    requiredMessage: string,
    chainId?: number,
  ): ContractProvider {
    if (this.config.contractProvider) {
      return this.config.contractProvider;
    }

    // Support legacy callers that pass a raw string (e.g. batchEthCall passes
    // `rpcUrl` as a plain string). Normalise to a ChainConfig-like object.
    const cfg: { rpcUrl?: string; rpcUrls?: string[] } =
      typeof chainConfig === 'string'
        ? { rpcUrl: chainConfig || undefined }
        : (chainConfig ?? {});

    const urls = mergeRpcUrls(cfg.rpcUrl, cfg.rpcUrls);

    if (urls.length === 0) {
      throw new GuildPassError(requiredMessage, GuildPassErrorCode.INVALID_CONFIG);
    }

    return new JsonRpcContractProvider(this.http, urls, this.config.hooks, chainId);
  }

  /**
   * Fetches the membership token balance for a wallet.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getMembershipTokenBalance(
    params: TokenBalanceParams,
    options?: RequestOptions,
  ): Promise<string> {
    // GuildPass SDK: Variable binding initialization.
    const { walletAddress, chainId } = params;
    const chainConfig = this.getChainConfig(chainId);
    const contractAddress = params.contractAddress ?? chainConfig.contractAddress;

    validateAddress(walletAddress);

    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for contract calls', chainId);

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for token balance lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);

    const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
    const result = await provider.ethCall({ to: contractAddress, data }, options);
    return decodeUint256Result(result);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Reads the ERC-20 `decimals()` of the membership/token contract. Needed to
   * turn the raw balance from {@link getMembershipTokenBalance} into a
   * human-readable amount.
   */
  public async getTokenDecimals(
    params: TokenBalanceParams,
    options?: RequestOptions,
  ): Promise<number> {
    const chainConfig = this.getChainConfig(params.chainId);
    const contractAddress = params.contractAddress ?? chainConfig.contractAddress;

    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for contract calls', params.chainId);

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for token decimals lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
    validateAddress(contractAddress);

    const result = await provider.ethCall({ to: contractAddress, data: DECIMALS_SELECTOR }, options);

    const decimals = Number(decodeUint256Result(result));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new GuildPassError(
        'Token contract returned an invalid decimals value',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }
    return decimals;
  }

  /**
   * Convenience: fetch the membership token balance together with the token's
   * `decimals` and a human-readable `formatted` string. Useful for displaying a
   * balance directly in a UI without manual decimal handling.
   */
  public async getMembershipTokenBalanceFormatted(
    params: TokenBalanceParams,
    options?: RequestOptions,
  ): Promise<FormattedTokenBalance> {
    const [raw, decimals] = await Promise.all([
      this.getMembershipTokenBalance(params, options),
      this.getTokenDecimals(params, options),
    ]);
    return { raw, decimals, formatted: formatUnits(raw, decimals) };
  }

  /**
   * Fetches the owner of a guild from the contract.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildOwner(params: GuildOwnerParams, options?: RequestOptions): Promise<string> {
    const chainConfig = this.getChainConfig(params.chainId);
    const { guildId, contractAddress = chainConfig.contractAddress } = params;

    validateGuildId(guildId);

    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for contract calls', params.chainId);

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for guild owner lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);
    const data = `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId(guildId)}`;

    const result = await provider.ethCall({ to: contractAddress, data }, options);
    return decodeAddressResult(result);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Validates whether a wallet satisfies an access requirement (TOKEN, NFT,
   * or on-chain ROLE checks resolve via a single `eth_call`; WHITELIST and
   * unrecognised requirement types fail fast with a descriptive error).
   */
  public async validateRoleRequirement(
    params: RoleRequirementParams,
    options?: RequestOptions,
  ): Promise<boolean> {
    const { walletAddress, requirement, chainId } = params;
    const chainConfig = this.getChainConfig(chainId);

    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for contract calls', chainId);

    return validateAccessRequirement(walletAddress, requirement, (to, data) =>
      provider.ethCall({ to, data }, options),
    );
  }

  // ---------------------------------------------------------------------------
  // Batch helpers
  // ---------------------------------------------------------------------------

  /**
   * Internal version of {@link batchEthCall} that accepts a full
   * {@link ChainConfig} (with `rpcUrl` + `rpcUrls`) so the failover provider
   * can be built correctly. Used by `getMembershipTokenBalancesBatch` and
   * `getGuildOwnersBatch` which already hold a resolved chain config.
   */
  private async batchEthCallInternal(
    calls: BatchEthCallItem[],
    chainConfig: { rpcUrl?: string; rpcUrls?: string[] },
    options?: RequestOptions & { maxBatchSize?: number; chunk?: boolean; chunkConcurrency?: number },
    chainId?: number,
  ): Promise<BatchItemResult[]> {
    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for batch contract calls', chainId);

    const limit = options?.maxBatchSize ?? 100;
    if (calls.length > limit) {
      if (!options?.chunk) {
        throw new GuildPassError(
          `Batch size ${calls.length} exceeds maxBatchSize ${limit}. Use chunk: true to split requests.`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }

      // Build chunks
      const chunks: BatchEthCallItem[][] = [];
      for (let i = 0; i < calls.length; i += limit) {
        chunks.push(calls.slice(i, i + limit));
      }

      // Validate chunkConcurrency
      const concurrency = this.validateChunkConcurrency(options?.chunkConcurrency);

      if (concurrency <= 1) {
        // Sequential path: preserve existing behaviour for backwards compatibility
        const results: BatchItemResult[] = [];
        for (const chunk of chunks) {
          const chunkResults = await this.batchEthCallInternal(
            chunk,
            chainConfig,
            { ...options, chunk: false },
            chainId,
          );
          results.push(...chunkResults);
        }
        return results;
      }

      // Bounded-concurrency worker-pool path
      return this.executeChunksConcurrently(chunks, concurrency, chainConfig, options, chainId);
    }

    return provider.batchEthCall(
      calls.map((call) => ({ to: call.to, data: call.data })),
      options,
    );
  }

  /**
   * Validates and normalises the `chunkConcurrency` option.
   * Returns `1` (sequential) when omitted, `0`, or negative.
   * Caps at 20 to protect the RPC provider.
   */
  private validateChunkConcurrency(raw?: number): number {
    if (raw === undefined || raw === null) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
    return Math.min(n, 20);
  }

  /**
   * Executes the given chunks concurrently with a bounded worker pool,
   * preserving output ordering by writing results into pre-allocated slots.
   */
  private async executeChunksConcurrently(
    chunks: BatchEthCallItem[][],
    concurrency: number,
    chainConfig: { rpcUrl?: string; rpcUrls?: string[] },
    options: (RequestOptions & { maxBatchSize?: number; chunk?: boolean }) | undefined,
    chainId: number | undefined,
  ): Promise<BatchItemResult[]> {
    // Pre-allocate result slots by chunk index so ordering is preserved
    const chunkResults: BatchItemResult[][] = new Array(chunks.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const idx = nextIndex;
        if (idx >= chunks.length) break;
        nextIndex = idx + 1;

        const chunkResult = await this.batchEthCallInternal(
          chunks[idx],
          chainConfig,
          { ...options, chunk: false },
          chainId,
        );
        chunkResults[idx] = chunkResult;
      }
    };

    const workers = Array(Math.min(concurrency, chunks.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);

    // Flatten in index order
    const results: BatchItemResult[] = [];
    for (const cr of chunkResults) {
      results.push(...cr);
    }
    return results;
  }

  /**
   * Sends a JSON-RPC batch request containing multiple read-only eth_call
   * requests. Returns an array of results in the same order as the input.
   *
   * Each call in the batch is individually resolved. If a particular call
   * fails (RPC-level error or missing result), its entry in the returned
   * array will have `status: 'error'` while other calls are unaffected.
   *
   * Only read-only methods should be batched. Mutating operations are not
   * supported in batch mode.
   *
   * @param calls    - Array of call descriptors (to + data) to batch.
   * @param rpcUrl   - The JSON-RPC endpoint URL (ignored when a
   *                   `contractProvider` is configured, which takes precedence).
   * @returns        - Ordered results, one per input call.
   */
  public async batchEthCall(
    calls: BatchEthCallItem[],
    rpcUrl?: string,
    options?: RequestOptions & { maxBatchSize?: number; chunk?: boolean; chunkConcurrency?: number },
  ): Promise<BatchItemResult[]> {
    if (!Array.isArray(calls) || calls.length === 0) {
      throw new GuildPassError(
        'At least one call is required for batchEthCall',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    const provider = this.resolveProvider(rpcUrl, 'rpcUrl is required for batch contract calls');

    const limit = options?.maxBatchSize ?? 100;
    if (calls.length > limit) {
      if (!options?.chunk) {
        throw new GuildPassError(
          `Batch size ${calls.length} exceeds maxBatchSize ${limit}. Use chunk: true to split requests.`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }

      // Build chunks
      const chunks: BatchEthCallItem[][] = [];
      for (let i = 0; i < calls.length; i += limit) {
        chunks.push(calls.slice(i, i + limit));
      }

      const concurrency = this.validateChunkConcurrency(options?.chunkConcurrency);

      if (concurrency <= 1) {
        // Sequential path: preserve existing behaviour for backwards compatibility
        const results: BatchItemResult[] = [];
        for (const chunk of chunks) {
          const chunkResults = await this.batchEthCall(chunk, rpcUrl, { ...options, chunk: false });
          results.push(...chunkResults);
        }
        return results;
      }

      // Bounded-concurrency worker-pool path
      // Pre-allocate result slots by chunk index so ordering is preserved
      const chunkResults: BatchItemResult[][] = new Array(chunks.length);
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const idx = nextIndex;
          if (idx >= chunks.length) break;
          nextIndex = idx + 1;

          const chunkResult = await this.batchEthCall(chunks[idx], rpcUrl, { ...options, chunk: false });
          chunkResults[idx] = chunkResult;
        }
      };

      const workers = Array(Math.min(concurrency, chunks.length))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      const results: BatchItemResult[] = [];
      for (const cr of chunkResults) {
        results.push(...cr);
      }
      return results;
    }

    // Validate each call descriptor up front
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      if (!call.to || typeof call.to !== 'string') {
        throw new GuildPassError(
          `batchEthCall item ${i}: 'to' is required`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }
      if (!call.data || typeof call.data !== 'string') {
        throw new GuildPassError(
          `batchEthCall item ${i}: 'data' is required`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }
      validateAddress(call.to);
    }

    return provider.batchEthCall(
      calls.map((call) => ({ to: call.to, data: call.data })),
      options,
    );
  }

  /**
   * Fetches membership token balances for multiple wallet addresses in a single
   * JSON-RPC batch request. Preserves the input order of wallet addresses.
   *
   * Each item in the returned array corresponds to the wallet address at the
   * same index in `params.walletAddresses`. Individual failures are reported
   * per item — a single failed address does not cause the whole batch to fail.
   *
   * @param params - Wallet addresses and optional chain/contract overrides.
   * @returns      - Ordered results, one per input wallet address.
   */
  public async getMembershipTokenBalancesBatch(
    params: TokenBalancesBatchParams,
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    const { walletAddresses, chainId, contractAddress: perCallContract } = params;

    if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      throw new GuildPassError(
        'walletAddresses array is required and must not be empty',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    // Validate all addresses upfront
    for (const addr of walletAddresses) {
      validateAddress(addr);
    }

    const chainConfig = this.getChainConfig(chainId);
    const contractAddress = perCallContract ?? chainConfig.contractAddress;

    if (!this.config.contractProvider && mergeRpcUrls(chainConfig.rpcUrl, chainConfig.rpcUrls).length === 0) {
      throw new GuildPassError(
        'rpcUrl is required for batch contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for batch token balance lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);

    // Build the batch calls
    const calls: BatchEthCallItem[] = walletAddresses.map((addr) => ({
      to: contractAddress,
      data: `${BALANCE_OF_SELECTOR}${encodeAddressArgument(addr)}`,
    }));

    const rawResults = await this.batchEthCallInternal(calls, chainConfig, {
      ...options,
      maxBatchSize: params.maxBatchSize,
      chunk: params.chunk,
      chunkConcurrency: params.chunkConcurrency,
    }, chainId);

    // Decode uint256 results where successful
    return rawResults.map((item) => {
      if (item.status === 'success' && item.result) {
        try {
          return {
            status: 'success' as const,
            result: decodeUint256Result(item.result),
          };
        } catch {
          return {
            status: 'error' as const,
            error: 'Failed to decode balance result',
          };
        }
      }
      return item;
    });
  }

  /**
   * Fetches guild owners for multiple guild IDs in a single JSON-RPC batch
   * request. Preserves the input order of guild IDs.
   *
   * Each item in the returned array corresponds to the guild ID at the same
   * index in `params.guildIds`. Individual failures are reported per item.
   *
   * @param params - Guild IDs and optional chain/contract overrides.
   * @returns      - Ordered results, one per input guild ID.
   */
  public async getGuildOwnersBatch(
    params: GuildOwnersBatchParams,
    options?: RequestOptions,
  ): Promise<BatchItemResult[]> {
    const { guildIds, chainId, contractAddress: perCallContract } = params;

    if (!Array.isArray(guildIds) || guildIds.length === 0) {
      throw new GuildPassError(
        'guildIds array is required and must not be empty',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    // Validate all guild IDs upfront
    for (const gid of guildIds) {
      validateGuildId(gid);
    }

    const chainConfig = this.getChainConfig(chainId);
    const contractAddress = perCallContract ?? chainConfig.contractAddress;

    if (!this.config.contractProvider && mergeRpcUrls(chainConfig.rpcUrl, chainConfig.rpcUrls).length === 0) {
      throw new GuildPassError(
        'rpcUrl is required for batch contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for batch guild owner lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);

    // Build the batch calls
    const calls: BatchEthCallItem[] = guildIds.map((gid) => ({
      to: contractAddress,
      data: `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId(gid)}`,
    }));

    const rawResults = await this.batchEthCallInternal(calls, chainConfig, {
      ...options,
      maxBatchSize: params.maxBatchSize,
      chunk: params.chunk,
      chunkConcurrency: params.chunkConcurrency,
    }, chainId);

    // Decode address results where successful
    return rawResults.map((item) => {
      if (item.status === 'success' && item.result) {
        try {
          return {
            status: 'success' as const,
            result: decodeAddressResult(item.result),
          };
        } catch {
          return {
            status: 'error' as const,
            error: 'Failed to decode guild owner result',
          };
        }
      }
      return item;
    });
  }
  // GuildPass SDK: End of logic containment structure block.
}
