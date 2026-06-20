// GuildPass SDK: Pull in package or module bindings.
import { AccessService } from '../access/access.service';
// GuildPass SDK: Import external module dependencies.
import { DEFAULT_CONFIG } from '../config/defaultConfig';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClientConfig, validateConfig } from '../config/sdkConfig';
// GuildPass SDK: Import external module dependencies.
import { ContractClient } from '../contracts/contractClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildsService } from '../guilds/guilds.service';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { MembershipService } from '../membership/membership.service';
// GuildPass SDK: Import external module dependencies.
import { RolesService } from '../roles/roles.service';

/**
 * The main GuildPass SDK client.
 *
 * Provides access to all GuildPass protocol services including
 * access control, membership, roles, and guilds.
 */
// GuildPass SDK: Exported component definition.
export class GuildPassClient {
  // GuildPass SDK: Class member structure property or constructor.
  public readonly access: AccessService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly membership: MembershipService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly roles: RolesService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly guilds: GuildsService;
  // GuildPass SDK: Class member structure property or constructor.
  public readonly contracts: ContractClient;

  // GuildPass SDK: Class member structure property or constructor.
  private readonly http: HttpClient;
  // GuildPass SDK: Class member structure property or constructor.
  private readonly config: GuildPassClientConfig;

  // GuildPass SDK: Class member structure property or constructor.
  constructor(config: GuildPassClientConfig) {
    validateConfig(config);
    // GuildPass SDK: Execution block boundary initialization.
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // GuildPass SDK: End of logic containment structure block.
    };

    this.http = new HttpClient(
      this.config.apiUrl,
      this.config.apiKey,
      this.config.timeoutMs,
      this.config.retry || this.config.hooks,
    );

    const validateResponses = this.config.validateResponses ?? false;
    this.access = new AccessService(this.http, validateResponses);
    this.membership = new MembershipService(this.http, validateResponses);
    this.roles = new RolesService(this.http, validateResponses);
    this.guilds = new GuildsService(this.http, validateResponses);
    this.contracts = new ContractClient(this.config);
    // GuildPass SDK: End of logic containment structure block.
  }

  /**
   * Returns the current SDK configuration.
   */
  // GuildPass SDK: Class member structure property or constructor.
  public getConfig(): GuildPassClientConfig {
    // GuildPass SDK: Send back computed results to the caller.
    return { ...this.config };
    // GuildPass SDK: End of logic containment structure block.
  }
  // GuildPass SDK: End of logic containment structure block.
}
