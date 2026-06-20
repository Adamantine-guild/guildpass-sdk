// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../errors/GuildPassError';
// GuildPass SDK: Import external module dependencies.
import { GuildPassErrorCode } from '../errors/errorCodes';
// GuildPass SDK: Pull in package or module bindings.
import { validateAddress } from '../utils/validation';
// GuildPass SDK: Import external module dependencies.
import { RoleRequirementParams, TokenBalanceParams } from './contract.types';
// GuildPass SDK: Pull in package or module bindings.
import { validateRoleRequirementStub } from './contractHelpers';
import { GuildPassClientConfig, resolveChainConfig } from '../config/sdkConfig';

// GuildPass SDK: Exported function execution unit.
export class ContractClient {
  // GuildPass SDK: Class member structure property or constructor.
  private readonly config: GuildPassClientConfig;

  // GuildPass SDK: Class member structure property or constructor.
  constructor(config: GuildPassClientConfig) {
    this.config = config;
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
   * Fetches the membership token balance for a wallet.
   * Stub for future on-chain support.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getMembershipTokenBalance(params: TokenBalanceParams): Promise<string> {
    // GuildPass SDK: Variable binding initialization.
    const { walletAddress, contractAddress = this.config.contractAddress } = params;

    validateAddress(walletAddress);
    // GuildPass SDK: Evaluate branch condition logic.
    if (contractAddress) validateAddress(contractAddress);

    // GuildPass SDK: Raise exceptional condition and throw error.
    throw new GuildPassError(
      'getMembershipTokenBalance is not yet implemented. Requires on-chain provider.',
      GuildPassErrorCode.NOT_IMPLEMENTED,
    );
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Fetches the owner of a guild from the contract.
   * Stub for future on-chain support.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async getGuildOwner(_params: { guildId: string }): Promise<string> {
    // GuildPass SDK: Propagate error state with specific code description.
    throw new GuildPassError(
      'getGuildOwner is not yet implemented. Requires on-chain provider.',
      GuildPassErrorCode.NOT_IMPLEMENTED,
    );
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Validates a role requirement for a wallet address.
   * Stub for future on-chain support.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public async validateRoleRequirement(params: RoleRequirementParams): Promise<boolean> {
    // GuildPass SDK: Local block-scoped constant reference.
    const { walletAddress, requirement } = params;
    // GuildPass SDK: Return evaluated output value.
    return validateRoleRequirementStub(walletAddress, requirement);
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
