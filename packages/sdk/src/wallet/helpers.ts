/**
 * Standard EIP-1193 Provider Interface
 * Represents an injected browser wallet (e.g., window.ethereum)
 */
export interface EIP1193Provider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on?(eventName: string, listener: (...args: any[]) => void): void;
  removeListener?(eventName: string, listener: (...args: any[]) => void): void;
}

/**
 * Parameters for adding a new chain to the wallet (EIP-3085)
 */
export interface AddEthereumChainParameter {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}/**
 * Checks if an EIP-1193 compliant wallet provider is injected in the browser context
 * @returns boolean indicating if window.ethereum or a similar provider exists
 */
export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Most EIP-1193 wallets inject themselves into window.ethereum
  return !!(window as any).ethereum;
}/**
 * Requests the wallet connection and returns the active account addresses
 */
export async function connectWallet(provider: EIP1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  return accounts || [];
}

/**
 * Retrieves the current connected hex chain ID from the wallet
 */
export async function getChainId(provider: EIP1193Provider): Promise<string> {
  return await provider.request({ method: 'eth_chainId' });
}

/**
 * Requests the wallet to switch to a different target blockchain network via hex chain ID
 * If the chain is not already added to the wallet (error code 4902), and chainParams is provided,
 * it will attempt to add the chain first, then retry the switch.
 */
export async function switchChain(
  provider: EIP1193Provider,
  chainId: string,
  chainParams?: AddEthereumChainParameter
): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (error: any) {
    // EIP-3326: Error code 4902 indicates the chain has not been added to the wallet
    if (error?.code === 4902) {
      if (chainParams) {
        // Add the chain first, then retry the switch
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [chainParams],
        });
        // Retry the switch after adding the chain
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId }],
        });
      } else {
        // Re-throw with a clearer error message
        throw new Error(
          `Chain ${chainId} is not added to the wallet. Please provide chainParams to add it automatically.`
        );
      }
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}