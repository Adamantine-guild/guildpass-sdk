/**
 * Standard EIP-1193 Provider Interface
 * Represents an injected browser wallet (e.g., window.ethereum)
 */
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';

export interface EIP1193Provider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on?(eventName: string, listener: (...args: any[]) => void): void;
  removeListener?(eventName: string, listener: (...args: any[]) => void): void;
}

/**
 * Checks if an EIP-1193 compliant wallet provider is injected in the browser context
 * @returns boolean indicating if window.ethereum or a similar provider exists
 */
export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Most EIP-1193 wallets inject themselves into window.ethereum
  return !!(window as any).ethereum;
}

/**
 * Requests the wallet connection and returns the active account addresses
 */
export async function connectWallet(provider: EIP1193Provider): Promise<string[]> {
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    return accounts || [];
  } catch (error: any) {
    if (error?.code === 4001) {
      throw new GuildPassError(
        'Wallet connection was rejected by the user',
        GuildPassErrorCode.WALLET_CONNECTION_REJECTED,
        undefined,
        error,
      );
    }

    throw new GuildPassError(
      'Wallet connection failed',
      GuildPassErrorCode.WALLET_ERROR,
      undefined,
      error,
    );
  }
}

/**
 * Retrieves the current connected hex chain ID from the wallet
 */
export async function getChainId(provider: EIP1193Provider): Promise<string> {
  return await provider.request({ method: 'eth_chainId' });
}

/**
 * Requests the wallet to switch to a different target blockchain network via hex chain ID
 */
export async function switchChain(provider: EIP1193Provider, chainId: string): Promise<void> {
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId }],
  });
}
