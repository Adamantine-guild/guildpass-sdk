/**
 * Canonical Stellar network identifiers supported by GuildPass SDK V2.
 */
export type StellarNetwork = "testnet" | "public" | "futurenet" | "standalone";

/**
 * Standard Stellar network passphrases for Soroban / Horizon transactions.
 */
export const STELLAR_NETWORK_PASSPHRASES = {
  public: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
  standalone: "Standalone Network ; February 2017",
} as const;

/**
 * Centrally defined list of supported Stellar networks.
 */
export const SUPPORTED_STELLAR_NETWORKS: readonly StellarNetwork[] = [
  "testnet",
  "public",
  "futurenet",
  "standalone",
] as const;

/**
 * Type guard to check if an unknown value is a supported Stellar network identifier.
 */
export function isStellarNetwork(value: unknown): value is StellarNetwork {
  return (
    typeof value === "string" &&
    (SUPPORTED_STELLAR_NETWORKS as readonly string[]).includes(value)
  );
}

/**
 * Normalizes input network name (accepts aliases like "mainnet" -> "public", "local" -> "standalone").
 *
 * @param network - The network name or alias.
 * @returns Canonical StellarNetwork identifier.
 * @throws {Error} If the network name is unsupported.
 */
export function normalizeStellarNetwork(network: string): StellarNetwork {
  if (typeof network !== "string" || !network.trim()) {
    throw new Error("Network must be a non-empty string");
  }

  const normalized = network.trim().toLowerCase();

  if (normalized === "mainnet" || normalized === "public") {
    return "public";
  }
  if (normalized === "testnet") {
    return "testnet";
  }
  if (normalized === "futurenet") {
    return "futurenet";
  }
  if (normalized === "standalone" || normalized === "local") {
    return "standalone";
  }

  throw new Error(
    `Unsupported Stellar network: "${network}". Supported networks: ${SUPPORTED_STELLAR_NETWORKS.join(", ")}`
  );
}

/**
 * Returns the network passphrase for a given Stellar network or network alias.
 *
 * @param network - Canonical StellarNetwork identifier or alias.
 * @returns Standard network passphrase string.
 */
export function getStellarNetworkPassphrase(network: StellarNetwork | string): string {
  const canonical = isStellarNetwork(network)
    ? network
    : normalizeStellarNetwork(network);

  return STELLAR_NETWORK_PASSPHRASES[canonical];
}

/**
 * Checks whether the given network is a test/development network (i.e. not public mainnet).
 *
 * @param network - Canonical StellarNetwork identifier or alias.
 * @returns True if the network is testnet, futurenet, or standalone; false for public mainnet.
 */
export function isTestNetwork(network: StellarNetwork | string): boolean {
  const canonical = isStellarNetwork(network)
    ? network
    : normalizeStellarNetwork(network);

  return canonical !== "public";
}
