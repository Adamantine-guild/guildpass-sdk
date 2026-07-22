// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClientConfig } from './sdkConfig';

// GuildPass SDK: Exposed interface structure.
export const DEFAULT_CONFIG: Partial<GuildPassClientConfig> = {
  apiUrl: 'https://api.guildpass.xyz',
  chainId: 1, // Ethereum Mainnet
  timeoutMs: 10000, // 10 seconds
  validateResponses: false,
  // GuildPass SDK: End of logic containment structure block.
};
