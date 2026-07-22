// GuildPass SDK: Core operational type definition.
export type NetworkConfig = {
  chainId: number;
  name: string;
  rpcUrl?: string;
  explorerUrl?: string;
  // GuildPass SDK: End of logic containment structure block.
};

// GuildPass SDK: Exported function execution unit.
export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  // GuildPass SDK: Execution block boundary initialization.
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    explorerUrl: 'https://etherscan.io',
    // GuildPass SDK: End of logic containment structure block.
  },
  // GuildPass SDK: Execution block boundary initialization.
  10: {
    chainId: 10,
    name: 'Optimism',
    explorerUrl: 'https://optimistic.etherscan.io',
    // GuildPass SDK: End of logic containment structure block.
  },
  // GuildPass SDK: Execution block boundary initialization.
  137: {
    chainId: 137,
    name: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    // GuildPass SDK: End of logic containment structure block.
  },
  // GuildPass SDK: Execution block boundary initialization.
  8453: {
    chainId: 8453,
    name: 'Base',
    explorerUrl: 'https://basescan.org',
    // GuildPass SDK: End of logic containment structure block.
  },
  // GuildPass SDK: Execution block boundary initialization.
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    explorerUrl: 'https://arbiscan.io',
    // GuildPass SDK: End of logic containment structure block.
  },
  // GuildPass SDK: End of logic containment structure block.
};
