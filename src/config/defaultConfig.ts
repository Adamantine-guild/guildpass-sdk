// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClientConfig } from './sdkConfig';

// GuildPass SDK: Exposed interface structure.
export const DEFAULT_CONFIG: Partial<GuildPassClientConfig> = {
  apiUrl: 'https://api.guildpass.xyz',
  chainId: 1, // Ethereum Mainnet
  timeoutMs: 10000, // 10 seconds
  // validateResponses is intentionally NOT set here: its default (true)
  // lives solely in GuildPassClient's constructor (`?? true`), so a value
  // set here would win over that fallback via the `??` operator and the
  // two defaults could silently drift out of sync — exactly what happened
  // before this comment was added.
  strictAddressChecksum: false,
  // GuildPass SDK: End of logic containment structure block.
};
