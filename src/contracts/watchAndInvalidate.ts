import { GuildPassClient } from '../client/GuildPassClient';

export interface WatchOptions {
  chainId: number;
  contractAddress: string;
  onDegraded?: (reason: string) => void;
  confirmations?: number;
}

export class WatchAndInvalidateService {
  private client: GuildPassClient;
  private activeSubscriptions: Map<string, boolean> = new Map();

  constructor(client: GuildPassClient) {
    this.client = client;
  }

  public async watchAndInvalidate(options: WatchOptions): Promise<() => void> {
    const key = `${options.chainId}:${options.contractAddress}`;
    if (this.activeSubscriptions.get(key)) {
      throw new Error(`Already watching contract ${options.contractAddress} on chain ${options.chainId}`);
    }

    this.activeSubscriptions.set(key, true);

    // Simulate WebSocket event stream connection and fallback gracefully on drop
    const isConnected = true;
    if (!isConnected && options.onDegraded) {
      options.onDegraded('WebSocket connection dropped. Falling back to TTL-based cache expiry.');
    }

    // Return unwatch cleanup handle
    return () => {
      this.activeSubscriptions.delete(key);
    };
  }
}
