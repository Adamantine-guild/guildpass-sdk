// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassConfigError, GuildPassResponseValidationError } from '../errors/errorTypes';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress, validateGuildId } from '../utils/validation';
// GuildPass SDK: Import external module dependencies.
// GuildPass SDK: Pull in package or module bindings.
import {
  BatchEthCallItem,
  BatchItemResult,
  ChainBalanceResult,
  ERC20BalanceParams,
  ERC721TokenParams,
  ERC1155BalanceParams,
  FormattedTokenBalance,
  GuildOwnerParams,
  GuildOwnersBatchParams,
  MembershipTokenBalancesParams,
  MembershipTokenBalancesResult,
  ReadContractParams,
  RoleRequirementParams,
  TokenBalanceParams,
  TokenBalancesBatchParams,
  ConsensusMismatchDetails,
  ConsensusMismatchFailure,
  ConsensusMismatchGroup,
  ContractReadConsensus,
} from './contract.types';
// GuildPass SDK: Pull in package or module bindings.
import {
  BALANCE_OF_SELECTOR,
  ERC1155_BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  DECIMALS_SELECTOR,
  ERC721_OWNER_OF_SELECTOR,
  HEX_32_BYTES_LENGTH,
  SUPPORTS_INTERFACE_SELECTOR,
  ERC165_INTERFACE_ID,
  ERC721_INTERFACE_ID,
  ERC1155_INTERFACE_ID,
  ACCESS_CONTROL_INTERFACE_ID,
  REQUIREMENT_TYPE_INTERFACE_IDS,
  decodeAddressResult,
  decodeUint256Result,
  decodeBoolResult,
  encodeAddressArgument,
  encodeGuildId,
  encodeInterfaceId,
  encodeUint256Argument,
  buildFunctionSignature,
  getFunctionSelector,
  encodeAbiParams,
  validateAccessRequirement,
} from './contractHelpers';
import { GuildPassClientConfig, resolveChainConfig, mergeRpcUrls } from '../config/sdkConfig';
import { HttpClient } from '../http/httpClient';
import { RequestOptions } from '../types/common';
import { ContractProvider, EthCallRequest } from './providers/provider.types';
import { JsonRpcContractProvider } from './providers/jsonRpcProvider';
import { Multicall3ContractProvider } from './providers/multicall3Provider';
import { MULTICALL3_ADDRESS } from './providers/adaptive.types';


// Local pure helper function for exact decimal string shift math
export const formatUnits = (value: string, decimals: number): string => {
  // Guard against negative decimal counts or non-integers
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new GuildPassConfigError('Decimals must be a non-negative integer', GuildPassErrorCode.INVALID_INPUT);
  }

  // Guard against invalid base unit numeric strings (letters or pre-existing decimals)
  if (!/^\d+$/.test(value)) {
    throw new GuildPassConfigError('Value must be a valid big integer string containing only digits', GuildPassErrorCode.INVALID_INPUT);
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
  ERC1155_BALANCE_OF_SELECTOR,
  GET_GUILD_OWNER_SELECTOR,
  DECIMALS_SELECTOR,
  ERC721_OWNER_OF_SELECTOR,
  HEX_32_BYTES_LENGTH,
  SUPPORTS_INTERFACE_SELECTOR,
  ERC165_INTERFACE_ID,
  ERC721_INTERFACE_ID,
  ERC1155_INTERFACE_ID,
  ACCESS_CONTROL_INTERFACE_ID,
  REQUIREMENT_TYPE_INTERFACE_IDS,
  decodeAddressResult,
  decodeUint256Result,
  decodeBoolResult,
  encodeAddressArgument,
  encodeGuildId,
  encodeInterfaceId,
  encodeUint256Argument,
  buildFunctionSignature,
  getFunctionSelector,
  encodeAbiParams,
};



// GuildPass SDK: Exported function execution unit.
/**
 * Canonicalises a raw hex string so that two providers returning the same
 * on-chain value compare equal regardless of leading-zero padding or hex
 * casing. Numbers and zero-padded addresses normalise to the same key.
 *
 * @internal
 */
const normalizeHex = (raw: unknown): string => {
  if (typeof raw !== 'string') {
    throw new GuildPassResponseValidationError(
      'Consensus path received a non-string provider result',
      GuildPassErrorCode.INVALID_RESPONSE,
    );
  }
  if (!/^0x[0-9a-fA-F]*$/.test(raw)) {
    // Anything that is not a hex string is treated as a distinct value and
    // surfaced in the error details — not silently passed through.
    return raw.toLowerCase();
  }
  const stripped = raw.slice(2).toLowerCase().replace(/^0+/, '');
  return stripped.length === 0 ? '0x0' : '0x' + stripped;
};

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
      return {
        rpcUrl: this.config.rpcUrl,
        rpcUrls: this.config.rpcUrls,
        contractAddress: this.config.contractAddress,
        multicallAddress: this.config.multicallAddress,
      };
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
    chainConfig: { rpcUrl?: string; rpcUrls?: string[]; multicallAddress?: string } | string | undefined,
    requiredMessage: string,
    chainId?: number,
  ): ContractProvider {
    if (this.config.contractProvider) {
      return this.config.contractProvider;
    }

    // Support legacy callers that pass a raw string (e.g. batchEthCall passes
    // `rpcUrl` as a plain string). Normalise to a ChainConfig-like object.
    const cfg: { rpcUrl?: string; rpcUrls?: string[]; multicallAddress?: string } =
      typeof chainConfig === 'string'
        ? { rpcUrl: chainConfig || undefined }
        : (chainConfig ?? {});

    const urls = mergeRpcUrls(cfg.rpcUrl, cfg.rpcUrls);

    if (urls.length === 0) {
      throw new GuildPassConfigError(requiredMessage, GuildPassErrorCode.INVALID_CONFIG);
    }

    if (this.config.batchStrategy === 'multicall3') {
      const multicallAddress = cfg.multicallAddress ?? this.config.multicallAddress ?? MULTICALL3_ADDRESS;
      return new Multicall3ContractProvider(this.http, urls, this.config.hooks, chainId, multicallAddress);
    }

    return new JsonRpcContractProvider(this.http, urls, this.config.hooks, chainId);
  }

  /**
   * Routes a single `eth_call` through either the configured `contractProvider`,
   * the consensus-verification path (issue #307), or the default single-URL
   * provider — in that precedence order.
   *
   * - **Custom provider**: short-circuits to `this.config.contractProvider`
   *   (used as-is, no consensus verification — the implementation is opaque
   *   to us).
   * - **Consensus**: fans out to all `contractReadConsensus.providers` in
   *   parallel and requires `minProviders` agreeing values.
   * - **Default**: falls through to `resolveProvider(...)` which uses the
   *   existing single-URL JSON-RPC / multicall3 / failover behaviour.
   *
   * Single-call read methods (`getMembershipTokenBalance`, `getERC20Balance`,
   * `ownsERC721Token`, `getERC1155Balance`, `getGuildOwner`, `readContract`)
   * all funnel through this helper so the precedence and override semantics
   * stay uniform. Batch helpers are out of scope for v1.
   */
  private async resolveSingleEthCall(
    chainConfig: { rpcUrl?: string; rpcUrls?: string[]; multicallAddress?: string } | string | undefined,
    requiredMessage: string,
    request: EthCallRequest,
    options: RequestOptions | undefined,
    chainId: number | undefined,
  ): Promise<unknown> {
    if (this.config.contractProvider) {
      return this.config.contractProvider.ethCall(request, options);
    }

    const consensus = this.config.contractReadConsensus;
    if (consensus) {
      return this.consensusEthCall(request, options, consensus, chainId);
    }

    const provider = this.resolveProvider(chainConfig, requiredMessage, chainId);
    return provider.ethCall(request, options);
  }

  /**
   * Cross-provider consensus verification of a single `eth_call` (issue #307).
   *
   * Fans the request out to every URL listed in `consensus.providers` in
   * parallel via `Promise.allSettled`, groups the successful results by
   * raw-hex equality (case-insensitive, leading-zero-insensitive), and
   * returns the first group's value iff its size is ≥ `minProviders`.
   *
   * Otherwise throws `GuildPassError(CONSENSUS_MISMATCH)` whose `details`
   * carries:
   *   - per-value groups with their URLs,
   *   - per-provider failures (network / revert / parse errors), and
   *   - the configured quorum.
   *
   * Caller-initiated aborts (`signal` already aborted, or any
   * `REQUEST_CANCELLED` / `ABORTED` error from a provider) are re-thrown
   * immediately rather than rolled into a generic mismatch — the user
   * explicitly asked to cancel, so the SDK honours that intent first.
   *
   * Notes:
   * - The block tag is always `'latest'` — a consensus quorum over
   *   historical reads (`confirmations`) would require cross-provider
   *   block-height agreement, which is reserved for a future enhancement.
   * - Each URL is queried through its own `JsonRpcContractProvider`
   *   instance, so per-URL retry/timeout/signal configuration from
   *   `options` is honoured independently.
   */
  private async consensusEthCall(
    request: EthCallRequest,
    options: RequestOptions | undefined,
    consensus: ContractReadConsensus,
    chainId: number | undefined,
  ): Promise<unknown> {
    const { providers, minProviders } = consensus;

    // Drop `confirmations` for consensus: every provider reads `'latest'` so
    // they all observe the same logical block. Historical consensus reads
    // would require an out-of-band block-height agreement protocol that is
    // out of scope for v1.
    const perProviderOptions: RequestOptions | undefined = options
      ? { ...options }
      : undefined;
    if (perProviderOptions) {
      delete (perProviderOptions as { confirmations?: unknown }).confirmations;
    }

    // One single-URL provider per consensus URL. Failover is intentionally not
    // applied here — short-circuiting to a backup URL would defeat the
    // purpose of independent cross-provider verification.
    const consumptions = providers.map((url) => ({
      url,
      provider: new JsonRpcContractProvider(this.http, url, this.config.hooks, chainId),
    }));

    const settled = await Promise.allSettled(
      consumptions.map(({ provider }) => provider.ethCall(request, perProviderOptions)),
    );

    // Honour explicit caller-initiated aborts before any consensus logic
    // runs, so a user's `AbortController` is not silently turned into a
    // "consensus mismatch" error.
    for (const r of settled) {
      if (r.status === 'rejected') {
        const reason = r.reason;
        if (reason instanceof GuildPassError &&
            (reason.code === GuildPassErrorCode.REQUEST_CANCELLED ||
             reason.code === GuildPassErrorCode.ABORTED)) {
          throw reason;
        }
      }
    }

    const groupByValue = new Map<string, ConsensusMismatchGroup>();
    const groups: ConsensusMismatchGroup[] = [];
    const failures: ConsensusMismatchFailure[] = [];
    let successfulCount = 0;

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const { url } = consumptions[i];

      if (r.status === 'fulfilled') {
        let normalized: string;
        try {
          normalized = normalizeHex(r.value);
        } catch (err) {
          // Non-string fulfillment is treated as a per-provider failure so it
          // is surfaced in the error details rather than crashing the
          // grouping logic.
          const code = err instanceof GuildPassError ? err.code : GuildPassErrorCode.INVALID_RESPONSE;
          const message = err instanceof Error ? err.message : String(err);
          failures.push({ url, code, message });
          continue;
        }

        let group = groupByValue.get(normalized);
        if (!group) {
          group = { value: normalized, urls: [], count: 0 };
          groupByValue.set(normalized, group);
          groups.push(group);
        }
        group.urls.push(url);
        group.count += 1;
        successfulCount += 1;
      } else {
        const reason = r.reason;
        const code = reason instanceof GuildPassError
          ? reason.code
          : GuildPassErrorCode.UNKNOWN_ERROR;
        const message = reason instanceof Error ? reason.message : String(reason);
        failures.push({ url, code, message });
      }
    }

    // Sort so callers see the front-runner first in error messages / logs.
    groups.sort((a, b) => b.count - a.count);

    const frontRunner = groups[0];
    if (frontRunner && frontRunner.count >= minProviders) {
      // Return the provider's actual (un-normalized) raw value. For raw
      // `eth_call` returns this is a hex string; callers like
      // `decodeUint256Result` only inspect the string shape, so picking any
      // provider's value from the winning group is equivalent.
      const winnerIdx = settled.findIndex((r, i) =>
        r.status === 'fulfilled' && consumptions[i].url === frontRunner.urls[0],
      );
      const winnerResult = settled[winnerIdx];
      if (winnerResult.status === 'fulfilled') {
        return winnerResult.value;
      }
      // Defensive fallback: the group only contains fulfilled entries.
      return frontRunner.value;
    }

    const failedCount = providers.length - successfulCount;
    const details: ConsensusMismatchDetails = {
      totalProviders: providers.length,
      successfulCount,
      failedCount,
      quorum: minProviders,
      groups,
      failures,
    };

    const frontRunnerCount = frontRunner?.count ?? 0;
    const message =
      `Contract read consensus mismatch: ${providers.length} providers queried, ` +
      `largest agreeing group returned ${frontRunnerCount} matching value(s), ` +
      `but quorum was ${minProviders}.` +
      (failedCount > 0
        ? ` ${failedCount} provider(s) failed outright; the remainder disagreed.`
        : ' No group of providers agreed.');

    throw new GuildPassResponseValidationError(message, GuildPassErrorCode.CONSENSUS_MISMATCH, undefined, details);
  }

  /**
   * Fetches the membership token balance for a wallet.
   *
   * Honours the opt-in `contractReadConsensus` config (issue #307): when
   * set, the `balanceOf(address)` call is fanned out across the configured
   * consensus providers in parallel and only returned when at least
   * `minProviders` of them agree. When NOT set, behavior is unchanged.
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

    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });

    if (!contractAddress) {
      throw new GuildPassConfigError(
        'contractAddress is required for token balance lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      chainId,
    );
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
      throw new GuildPassConfigError(
        'contractAddress is required for token decimals lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }
    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const result = await provider.ethCall({ to: contractAddress, data: DECIMALS_SELECTOR }, options);

    const decimals = Number(decodeUint256Result(result));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new GuildPassResponseValidationError(
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
   * Fetches the membership token balance for a wallet across **every**
   * configured chain in a single call.
   *
   * Iterates all chain IDs present in `config.chains` (plus the top-level
   * `config.chainId` when no per-chain map is configured), fires the
   * underlying {@link getMembershipTokenBalance} calls in parallel, and
   * returns a map keyed by chain ID.
   *
   * A failure on one chain's RPC does **not** prevent results from the other
   * chains from being returned — each chain's outcome is reported
   * independently via the {@link ChainBalanceResult} discriminated union.
   *
   * @throws `INVALID_CONFIG` when no chain IDs can be determined from the
   *   client config (neither `chainId` nor `chains` is set).
   * @throws `INVALID_ADDRESS` when `walletAddress` is not a valid EVM address.
   */
  public async getMembershipTokenBalances(
    params: MembershipTokenBalancesParams,
    options?: RequestOptions,
  ): Promise<MembershipTokenBalancesResult> {
    const { walletAddress, contractAddress } = params;
    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });

    // Collect every chain ID we should query.
    const chainIds: number[] = [];
    if (this.config.chains) {
      for (const key of Object.keys(this.config.chains)) {
        chainIds.push(Number(key));
      }
    } else if (this.config.chainId !== undefined) {
      chainIds.push(this.config.chainId);
    }

    if (chainIds.length === 0) {
      throw new GuildPassConfigError(
        'getMembershipTokenBalances requires at least one chain configured via chainId or chains',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    // Query all chains in parallel; capture per-chain errors without throwing.
    const entries = await Promise.all(
      chainIds.map(async (chainId): Promise<[number, ChainBalanceResult]> => {
        try {
          const balance = await this.getMembershipTokenBalance(
            { walletAddress, chainId, contractAddress },
            options,
          );
          return [chainId, { status: 'success', balance }];
        } catch (err: any) {
          return [chainId, { status: 'error', error: err?.message ?? String(err) }];
        }
      }),
    );

    const result: MembershipTokenBalancesResult = {};
    for (const [chainId, chainResult] of entries) {
      result[chainId] = chainResult;
    }
    return result;
  }

  /**
   * Convenience: fetches the ERC-20 token balance for a wallet.
   * Equivalent to the ERC-20 `balanceOf(address)` call.
   *
   * Unlike {@link getMembershipTokenBalance}, this method requires a
   * `contractAddress` on every call because there is no single "membership
   * token" concept for arbitrary ERC-20 tokens.
   *
   * Honours the opt-in `contractReadConsensus` config: when set, the
   * `balanceOf` call is fanned out across consensus providers in parallel
   * and only returned when at least `minProviders` of them agree.
   */
  public async getERC20Balance(
    params: ERC20BalanceParams,
    options?: RequestOptions,
  ): Promise<string> {
    const { walletAddress, chainId, contractAddress } = params;
    const chainConfig = this.getChainConfig(chainId);

    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });
    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const data = `${BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}`;
    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      chainId,
    );
    return decodeUint256Result(result);
  }

  /**
   * Checks whether a wallet owns a specific ERC-721 token.
   * Calls `ownerOf(uint256)` on the contract and compares the result with
   * the given wallet address.
   *
   * Honours the opt-in `contractReadConsensus` config: when set, the
   * `ownerOf` call is fanned out across consensus providers in parallel
   * and only returned when at least `minProviders` of them agree.
   */
  public async ownsERC721Token(
    params: ERC721TokenParams,
    options?: RequestOptions,
  ): Promise<boolean> {
    const { walletAddress, tokenId, chainId, contractAddress } = params;
    const chainConfig = this.getChainConfig(chainId);

    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });
    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const data = `${ERC721_OWNER_OF_SELECTOR}${encodeUint256Argument(tokenId, 'tokenId')}`;
    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      chainId,
    );
    const owner = decodeAddressResult(result);
    return owner.toLowerCase() === walletAddress.toLowerCase();
  }

  /**
   * Fetches the ERC-1155 token balance for a wallet and token ID.
   * Calls `balanceOf(address,uint256)` on the contract.
   *
   * Honours the opt-in `contractReadConsensus` config: when set, the
   * `balanceOf` call is fanned out across consensus providers in parallel
   * and only returned when at least `minProviders` of them agree.
   */
  public async getERC1155Balance(
    params: ERC1155BalanceParams,
    options?: RequestOptions,
  ): Promise<string> {
    const { walletAddress, tokenId, chainId, contractAddress } = params;
    const chainConfig = this.getChainConfig(chainId);

    validateAddress(walletAddress, { strict: this.config.strictAddressChecksum });
    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const data = `${ERC1155_BALANCE_OF_SELECTOR}${encodeAddressArgument(walletAddress)}${encodeUint256Argument(tokenId, 'tokenId')}`;
    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      chainId,
    );
    return decodeUint256Result(result);
  }

  /**
   * Generic escape hatch for arbitrary read-only contract calls.
   *
   * Accepts an ABI fragment plus arguments, encodes them into an `eth_call`,
   * and returns the raw decoded hex result as a string.
   *
   * Use this when the built-in convenience methods
   * ({@link getERC20Balance}, {@link ownsERC721Token},
   * {@link getERC1155Balance}) do not cover your use case.
   *
   * Only static ABI types (address, bool, uint*, int*, bytes32) are supported
   * for argument encoding. For dynamic types (bytes, string) or custom result
   * decoding, call {@link batchEthCall} with pre-encoded calldata and decode
   * the result yourself using the exported decoder helpers
   * (`decodeAddressResult`, `decodeUint256Result`, `decodeBoolResult`).
   */
  public async readContract(
    params: ReadContractParams,
    options?: RequestOptions,
  ): Promise<string> {
    const { contractAddress, abi, functionName, args, chainId } = params;
    const chainConfig = this.getChainConfig(chainId);

    if (abi.name !== functionName) {
      throw new GuildPassConfigError(
        `readContract: functionName "${functionName}" does not match ABI name "${abi.name}"`,
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

    const signature = buildFunctionSignature(abi);
    const selector = getFunctionSelector(signature);
    const data = encodeAbiParams(selector, abi.inputs, args);

    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      chainId,
    );

    // Return the raw hex result — callers can decode it with
    // decodeUint256Result, decodeAddressResult, decodeBoolResult, etc.
    if (typeof result !== 'string') {
      throw new GuildPassResponseValidationError(
        'readContract: expected a hex string result',
        GuildPassErrorCode.INVALID_RESPONSE,
      );
    }
    return result;
  }

  /**
   * Fetches the owner of a guild from the contract.
   *
   * Honours the opt-in `contractReadConsensus` config: when set, the
   * `getGuildOwner` call is fanned out across consensus providers in
   * parallel and only returned when at least `minProviders` of them agree.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildOwner(params: GuildOwnerParams, options?: RequestOptions): Promise<string> {
    const chainConfig = this.getChainConfig(params.chainId);
    const { guildId, contractAddress = chainConfig.contractAddress } = params;

    validateGuildId(guildId);

    if (!contractAddress) {
      throw new GuildPassConfigError(
        'contractAddress is required for guild owner lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });
    const data = `${GET_GUILD_OWNER_SELECTOR}${encodeGuildId(guildId)}`;

    const result = await this.resolveSingleEthCall(
      chainConfig,
      'rpcUrl is required for contract calls',
      { to: contractAddress, data },
      options,
      params.chainId,
    );
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

    // Route every internal eth_call (supportsInterface, balanceOf, ownerOf,
    // hasRole) through resolveSingleEthCall so the precedence
    // (contractProvider > contractReadConsensus > default) applies uniformly
    // to the whole access-requirement graph. When consensus is configured,
    // each underlying call is fanned out across the configured providers and
    // must reach quorum before the requirement decides to be met.
    return validateAccessRequirement(
      walletAddress,
      requirement,
      (to, data) => this.resolveSingleEthCall(
        chainConfig,
        'rpcUrl is required for contract calls',
        { to, data },
        options,
        chainId,
      ),
      this.config.strictInterfaceChecking,
    );
  }

  /**
   * Cross-provider consensus verification of a batch `eth_call` request
   * (issue #307 follow-up).
   *
   * Issues the same array of requests to every URL listed in
   * `consensus.providers` in parallel via `Promise.allSettled`. For each
   * `requests[i]` the SDK independently ballots the N per-provider responses:
   *   - Successful raw-hex results are grouped by `normalizeHex`.
   *   - The largest agreeing group's value wins iff its size is ≥ `minProviders`.
   *   - Otherwise index `i` becomes `{ status: 'error', error: 'Consensus
   *     mismatch: ...' }`. The batch never throws for an item-level
   *     disagreement — that mirrors the existing batch semantics where
   *     per-item failures are surfaced as results, not rejected promises.
   *
   * Whole-batch failure: if every provider rejected the batch outright (no
   * provider returned a parseable response), the SDK throws `CONSENSUS_MISMATCH`
   * at the batch level because there is no per-item ballot to attribute.
   *
   * Caller-initiated aborts (`REQUEST_CANCELLED` / `ABORTED` errors) are
   * re-thrown immediately, mirroring the single-call consensus path.
   *
   * The block tag is always `latest`; the `confirmations` option is silently
   * dropped here for the same reason as in {@link consensusEthCall}.
   */
  private async consensusBatchEthCall(
    requests: EthCallRequest[],
    options: RequestOptions | undefined,
    consensus: ContractReadConsensus,
    chainId: number | undefined,
  ): Promise<BatchItemResult[]> {
    const { providers, minProviders } = consensus;

    // Drop `confirmations` so every provider reads `latest` in lock-step.
    const perProviderOptions: RequestOptions | undefined = options
      ? { ...options }
      : undefined;
    if (perProviderOptions) {
      delete (perProviderOptions as { confirmations?: unknown }).confirmations;
    }

    const consumptions = providers.map((url) => ({
      url,
      provider: new JsonRpcContractProvider(this.http, url, this.config.hooks, chainId),
    }));

    const settled = await Promise.allSettled(
      consumptions.map(({ provider }) => provider.batchEthCall(requests, perProviderOptions)),
    );

    // Honour explicit caller-initiated aborts first.
    for (const r of settled) {
      if (r.status === 'rejected') {
        const reason = r.reason;
        if (reason instanceof GuildPassError &&
            (reason.code === GuildPassErrorCode.REQUEST_CANCELLED ||
             reason.code === GuildPassErrorCode.ABORTED)) {
          throw reason;
        }
      }
    }

    // Edge case: every provider rejected the entire batch. There is no
    // per-item ballot to run, so surface the failure at the batch level.
    const anyProviderSucceeded = settled.some((r) => r.status === 'fulfilled');
    if (!anyProviderSucceeded && settled.length > 0 && requests.length > 0) {
      const failures: ConsensusMismatchFailure[] = consumptions.map(({ url }, idx) => {
        const r = settled[idx];
        const reason = r.status === 'rejected' ? r.reason : undefined;
        const code = reason instanceof GuildPassError
          ? reason.code
          : GuildPassErrorCode.UNKNOWN_ERROR;
        const msg = reason instanceof Error ? reason.message : String(reason ?? '');
        return { url, code, message: msg };
      });
      throw new GuildPassResponseValidationError(
        `Contract batch consensus read failed across all ${providers.length} providers.`,
        GuildPassErrorCode.CONSENSUS_MISMATCH,
        undefined,
        {
          totalProviders: providers.length,
          successfulCount: 0,
          failedCount: providers.length,
          quorum: minProviders,
          groups: [],
          failures,
        },
      );
    }

    // Per-index consensus ballot. Result array preserves the input order.
    const results: BatchItemResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const groupByValue = new Map<string, { value: string; count: number }>();
      let winningValue: string | undefined;
      let winningCount = 0;

      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];

        if (r.status !== 'fulfilled') continue;

        const arr = r.value;
        if (!Array.isArray(arr) || arr.length !== requests.length) {
          // Whole-batch response shape mismatch from this provider. Treat
          // as "this provider contributed nothing" for index i rather than
          // surfacing the structural issue inline — other providers may
          // still satisfy the quorum for this index.
          continue;
        }

        const item = arr[i];
        if (!item || item.status !== 'success' || typeof item.result !== 'string') continue;

        let normalized: string;
        try {
          normalized = normalizeHex(item.result);
        } catch {
          continue;
        }

        let group = groupByValue.get(normalized);
        if (!group) {
          group = { value: item.result, count: 0 };
          groupByValue.set(normalized, group);
        }
        group.count += 1;

        if (group.count > winningCount) {
          winningCount = group.count;
          winningValue = item.result;
        }
      }

      if (winningCount >= minProviders && winningValue !== undefined) {
        results.push({ status: 'success', result: winningValue });
      } else {
        let totalVotes = 0;
        for (const g of groupByValue.values()) totalVotes += g.count;
        results.push({
          status: 'error',
          error: `Consensus mismatch at batch index ${i}: largest agreeing group returned ${winningCount} matching value(s) (quorum: ${minProviders}, total successful votes: ${totalVotes}).`,
        });
      }
    }

    return results;
  }

  /**
   * Routes a batch `eth_call` through the same precedence chain as
   * {@link resolveSingleEthCall}: `contractProvider` > `contractReadConsensus` >
   * default. This is the leaf-call resolver shared by {@link batchEthCall} and
   * {@link batchEthCallInternal} so chunking recursion lands here uniformly.
   *
   * Throws `INVALID_CONFIG` if both `contractReadConsensus` and
   * `batchStrategy === 'multicall3'` are set: Multicall3 aggregates calls
   * into a single on-chain transaction per provider, so cross-provider
   * verification cannot be applied when the provider-side aggregator has
   * already collapsed the calls.
   */
  private async resolveBatchEthCall(
    calls: BatchEthCallItem[],
    chainConfig: { rpcUrl?: string; rpcUrls?: string[] },
    options: RequestOptions | undefined,
    chainId: number | undefined,
  ): Promise<BatchItemResult[]> {
    const requests: EthCallRequest[] = calls.map((c) => ({ to: c.to, data: c.data }));

    if (this.config.contractProvider) {
      return this.config.contractProvider.batchEthCall(requests, options);
    }

    if (this.config.contractReadConsensus) {
      if (this.config.batchStrategy === 'multicall3') {
        throw new GuildPassConfigError(
          'batchStrategy "multicall3" cannot be used concurrently with contractReadConsensus: ' +
            'Multicall3 collapses multiple calls into a single on-chain transaction per provider, ' +
            'which defeats cross-provider verification. Disable one of the two.',
          GuildPassErrorCode.INVALID_CONFIG,
        );
      }
      return this.consensusBatchEthCall(
        requests,
        options,
        this.config.contractReadConsensus,
        chainId,
      );
    }

    const provider = this.resolveProvider(chainConfig, 'rpcUrl is required for batch contract calls', chainId);
    return provider.batchEthCall(requests, options);
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
    const limit = options?.maxBatchSize ?? 100;
    if (calls.length > limit) {
      if (!options?.chunk) {
        throw new GuildPassConfigError(
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

    // Leaf path: route through the same precedence chain as single-call reads
    // (contractProvider > contractReadConsensus > default). Chunked recursion
    // lands here too, which means large batched consensus reads run their
    // per-item quorum on each chunk independently — so 200 items at
    // maxBatchSize=50 + chunkConcurrency=2 produces 4 sequential consensus
    // ballots, preserving the per-chunk quorum semantics from v1.
    return this.resolveBatchEthCall(calls, chainConfig, options, chainId);
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
   * Validates a caller-supplied `maxBatchSize` before it reaches any chunking
   * logic. A non-positive limit makes the chunk-building loop advance by <= 0
   * and spin forever (`chunks.push(...)` until the process runs out of memory),
   * and a `NaN` limit silently disables the size check altogether, so both are
   * rejected up front.
   *
   * Unlike `chunkConcurrency`, which has a safe sequential fallback and is
   * therefore clamped rather than rejected, `maxBatchSize` has no safe default
   * other than the built-in 100 — an invalid caller value can only be a mistake,
   * so it fails loudly.
   *
   * `undefined` is allowed and leaves the built-in default (100) in place.
   */
  private validateMaxBatchSize(value?: number): void {
    if (value === undefined) return;

    if (!Number.isInteger(value) || value <= 0) {
      throw new GuildPassConfigError(
        `Invalid maxBatchSize ${value}: must be a positive integer`,
        GuildPassErrorCode.INVALID_INPUT,
      );
    }
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
      throw new GuildPassConfigError(
        'At least one call is required for batchEthCall',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    this.validateMaxBatchSize(options?.maxBatchSize);

    const limit = options?.maxBatchSize ?? 100;
    if (calls.length > limit) {
      if (!options?.chunk) {
        throw new GuildPassConfigError(
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
        throw new GuildPassConfigError(
          `batchEthCall item ${i}: 'to' is required`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }
      if (!call.data || typeof call.data !== 'string') {
        throw new GuildPassConfigError(
          `batchEthCall item ${i}: 'data' is required`,
          GuildPassErrorCode.INVALID_INPUT,
        );
      }
      validateAddress(call.to, { strict: this.config.strictAddressChecksum });
    }

    // Resolve precedence at the leaf path so chunked recursion also routes
    // through it. resolveBatchEthCall enforces the same precedence chain as
    // the single-call reads (contractProvider > contractReadConsensus >
    // default). When `contractReadConsensus` is configured, the explicit
    // `rpcUrl` argument is **ignored** — the SDK queries every URL listed in
    // `consensus.providers` in parallel instead. Pass `rpcUrl` only when
    // running without consensus (the default behaviour); callers who want to
    // pick a specific endpoint should configure a custom `contractProvider`
    // or use the dedicated consensus URLs.
    return this.resolveBatchEthCall(
      calls,
      { rpcUrl: rpcUrl || undefined },
      options,
      undefined,
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
      throw new GuildPassConfigError(
        'walletAddresses array is required and must not be empty',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    this.validateMaxBatchSize(params.maxBatchSize);

    // Validate all addresses upfront
    for (const addr of walletAddresses) {
      validateAddress(addr, { strict: this.config.strictAddressChecksum });
    }

    const chainConfig = this.getChainConfig(chainId);
    const contractAddress = perCallContract ?? chainConfig.contractAddress;

    if (
      !this.config.contractProvider &&
      !this.config.contractReadConsensus &&
      mergeRpcUrls(chainConfig.rpcUrl, chainConfig.rpcUrls).length === 0
    ) {
      throw new GuildPassConfigError(
        'rpcUrl is required for batch contract calls (or configure contractReadConsensus)',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassConfigError(
        'contractAddress is required for batch token balance lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

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
      throw new GuildPassConfigError(
        'guildIds array is required and must not be empty',
        GuildPassErrorCode.INVALID_INPUT,
      );
    }

    this.validateMaxBatchSize(params.maxBatchSize);

    // Validate all guild IDs upfront
    for (const gid of guildIds) {
      validateGuildId(gid);
    }

    const chainConfig = this.getChainConfig(chainId);
    const contractAddress = perCallContract ?? chainConfig.contractAddress;

    if (
      !this.config.contractProvider &&
      !this.config.contractReadConsensus &&
      mergeRpcUrls(chainConfig.rpcUrl, chainConfig.rpcUrls).length === 0
    ) {
      throw new GuildPassConfigError(
        'rpcUrl is required for batch contract calls (or configure contractReadConsensus)',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    if (!contractAddress) {
      throw new GuildPassConfigError(
        'contractAddress is required for batch guild owner lookup',
        GuildPassErrorCode.INVALID_CONFIG,
      );
    }

    validateAddress(contractAddress, { strict: this.config.strictAddressChecksum });

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
