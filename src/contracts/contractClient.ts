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
import { GuildPassClientConfig, resolveChainConfig } from '../config/sdkConfig';
import { HttpClient } from '../http/httpClient';
import { RequestOptions } from '../types/common';

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



type JsonRpcSuccess = {
  result?: unknown;
};

type JsonRpcError = {
  error?: {
    code?: number;
    message?: string;
  };
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
   * Sends a single read-only `eth_call` and returns its raw (undecoded)
   * result. Shared by all single-call contract reads so the JSON-RPC
   * envelope and error handling live in exactly one place.
   */
  private async performEthCall(
    to: string,
    data: string,
    rpcUrl: string,
    options?: RequestOptions,
  ): Promise<unknown> {
    const payload = await this.http.post<(JsonRpcSuccess & JsonRpcError) | undefined>(
      rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      },
      {
        ...options,
        retry: {
          allowMutatingRetry: true,
          ...options?.retry,
        },
      },
    );

    if (payload?.error) {
      throw new GuildPassError(
        payload.error.message ?? 'RPC provider returned an error',
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        payload.error,
      );
    }

    return payload?.result;
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

    if (!chainConfig.rpcUrl) {
      throw new GuildPassError(
        'rpcUrl is required for contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for token balance lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);

    const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
    const result = await this.performEthCall(contractAddress, data, chainConfig.rpcUrl, options);
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

    if (!chainConfig.rpcUrl) {
      throw new GuildPassError(
        'rpcUrl is required for contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for token decimals lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
    validateAddress(contractAddress);

    const payload = await this.http.post<(JsonRpcSuccess & JsonRpcError) | undefined>(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: contractAddress, data: DECIMALS_SELECTOR }, 'latest'],
      },
      {
        ...options,
        retry: {
          allowMutatingRetry: true,
          ...options?.retry,
        },
      },
    );

    if (payload?.error) {
      throw new GuildPassError(
        payload.error.message ?? 'RPC provider returned an error',
        GuildPassErrorCode.HTTP_ERROR,
        undefined,
        payload.error,
      );
    }

    const decimals = Number(decodeUint256Result(payload?.result));
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
    const rpcUrl = chainConfig.rpcUrl;

    validateGuildId(guildId);

    if (!rpcUrl) {
      throw new GuildPassError(
        'rpcUrl is required for contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassError(
        'contractAddress is required for guild owner lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress);
    const data = `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId(guildId)}`;

    const result = await this.performEthCall(contractAddress, data, rpcUrl, options);
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

    if (!chainConfig.rpcUrl) {
      throw new GuildPassError(
        'rpcUrl is required for contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    const rpcUrl = chainConfig.rpcUrl;
    return validateAccessRequirement(walletAddress, requirement, (to, data) =>
      this.performEthCall(to, data, rpcUrl, options),
    );
  }

  // ---------------------------------------------------------------------------
  // Batch helpers
  // ---------------------------------------------------------------------------

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
   * @param rpcUrl   - The JSON-RPC endpoint URL.
   * @returns        - Ordered results, one per input call.
   */
  public async batchEthCall(
    calls: BatchEthCallItem[],
    rpcUrl: string,
    options?: RequestOptions & { maxBatchSize?: number; chunk?: boolean },
  ): Promise<BatchItemResult[]> {
    if (!Array.isArray(calls) || calls.length === 0) {
      throw new GuildPassError(
        'At least one call is required for batchEthCall',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    if (!rpcUrl) {
      throw new GuildPassError(
        'rpcUrl is required for batch contract calls',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    const limit = options?.maxBatchSize ?? 100;
    if (calls.length > limit) {
      if (!options?.chunk) {
        throw new GuildPassError(
          `Batch size ${calls.length} exceeds maxBatchSize ${limit}. Use chunk: true to split requests.`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }

      const results: BatchItemResult[] = [];
      for (let i = 0; i < calls.length; i += limit) {
        const chunkCalls = calls.slice(i, i + limit);
        const chunkResults = await this.batchEthCall(chunkCalls, rpcUrl, { ...options, chunk: false });
        results.push(...chunkResults);
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

    // Build the JSON-RPC batch payload
    const batchPayload = calls.map((call, idx) => ({
      jsonrpc: '2.0' as const,
      id: idx + 1,
      method: 'eth_call' as const,
      params: [
        {
          to: call.to,
          data: call.data,
        },
        'latest',
      ],
    }));

    type JsonRpcBatchResponseItem = {
      id?: number;
      result?: unknown;
      error?: {
        code?: number;
        message?: string;
      };
    };

    const payloads = await this.http.post<JsonRpcBatchResponseItem[]>(
      rpcUrl,
      batchPayload,
      {
        ...options,
        retry: {
          allowMutatingRetry: true,
          ...options?.retry,
        },
      },
    );

    if (!Array.isArray(payloads)) {
      throw new GuildPassError(
        'Batch RPC response is not an array',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }

    // Map responses back by their JSON-RPC id to preserve input order
    const responseMap = new Map<number, JsonRpcBatchResponseItem>();
    for (const p of payloads) {
      if (p && typeof p.id === 'number') {
        responseMap.set(p.id, p);
      }
    }

    const results: BatchItemResult[] = [];

    for (let i = 0; i < calls.length; i++) {
      const expectedId = i + 1;
      const payload = responseMap.get(expectedId);

      if (!payload) {
        results.push({
          status: 'error',
          error: `No response for batch item ${i} (id: ${expectedId})`,
        });
      } else if (payload.error) {
        results.push({
          status: 'error',
          error: payload.error.message ?? `RPC error (code: ${payload.error.code})`,
        });
      } else if (payload.result === undefined || payload.result === null) {
        results.push({
          status: 'error',
          error: `Empty result for batch item ${i}`,
        });
      } else if (typeof payload.result !== 'string') {
        results.push({
          status: 'error',
          error: `Unexpected result type for batch item ${i}`,
        });
      } else {
        results.push({
          status: 'success',
          result: payload.result,
        });
      }
    }

    return results;
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

    if (!chainConfig.rpcUrl) {
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

    const rawResults = await this.batchEthCall(calls, chainConfig.rpcUrl, {
      ...options,
      maxBatchSize: params.maxBatchSize,
      chunk: params.chunk,
    });

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

    if (!chainConfig.rpcUrl) {
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

    const rawResults = await this.batchEthCall(calls, chainConfig.rpcUrl, {
      ...options,
      maxBatchSize: params.maxBatchSize,
      chunk: params.chunk,
    });

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
