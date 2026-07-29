import { GuildPassClientConfig, mergeRpcUrls, resolveChainConfig } from '../config/sdkConfig';
import { GuildPassError } from '../errors/GuildPassError';
import { GuildPassErrorCode } from '../errors/errorCodes';
import { JsonRpcContractProvider } from '../contracts/providers/jsonRpcProvider';
import { WebSocketContractProvider } from '../contracts/providers/webSocketProvider';
import { TransferCallback, TransferEvent } from '../contracts/providers/provider.types';
import { keccak256 } from 'js-sha3';

export interface ChainWatcherOptions {
  config: GuildPassClientConfig;
  onInvalidateWallet: (walletAddress: string) => void;
  onInvalidateGuild: (guildId: string) => void;
}

export class ChainWatcher {
  private readonly config: GuildPassClientConfig;
  private readonly onInvalidateWallet: (walletAddress: string) => void;
  private readonly onInvalidateGuild: (guildId: string) => void;

  private watchedWallets = new Set<string>();
  private watchedGuilds = new Set<string>();

  private wsProvider: WebSocketContractProvider | null = null;
  private httpProvider: JsonRpcContractProvider | null = null;
  
  private unsubscribeTokenTransfer: (() => void) | null = null;
  
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPolledBlock = 0;
  private isPolling = false;

  private readonly TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  private readonly GUILD_OWNERSHIP_TRANSFERRED_TOPIC = '0x' + keccak256('GuildOwnershipTransferred(bytes32,address)');

  constructor(options: ChainWatcherOptions) {
    this.config = options.config;
    this.onInvalidateWallet = options.onInvalidateWallet;
    this.onInvalidateGuild = options.onInvalidateGuild;
  }

  public watchWallet(address: string): void {
    const normalized = address.toLowerCase();
    this.watchedWallets.add(normalized);
    this.ensureStarted();
  }

  public unwatchWallet(address: string): void {
    this.watchedWallets.delete(address.toLowerCase());
    this.checkTeardown();
  }

  public watchGuild(guildId: string): void {
    this.watchedGuilds.add(guildId);
    this.ensureStarted();
  }

  public unwatchGuild(guildId: string): void {
    this.watchedGuilds.delete(guildId);
    this.checkTeardown();
  }

  public stopWatching(): void {
    this.watchedWallets.clear();
    this.watchedGuilds.clear();
    this.teardown();
  }

  public dispose(): void {
    this.stopWatching();
  }

  private ensureStarted(): void {
    if (this.wsProvider || this.pollingInterval !== null) return; // already started

    const defaultChainId = this.config.chainId || 1;
    const chainConfig = resolveChainConfig(this.config, defaultChainId);
    const rpcUrls = mergeRpcUrls(chainConfig.rpcUrl, chainConfig.rpcUrls);
    if (rpcUrls.length === 0) return; // No RPC configured, cannot watch
    
    const primaryUrl = rpcUrls[0];
    const contractAddress = chainConfig.contractAddress;

    if (!contractAddress) return;

    if (primaryUrl.startsWith('ws://') || primaryUrl.startsWith('wss://')) {
      this.startWebSocket(primaryUrl, contractAddress);
    } else {
      this.startPolling(primaryUrl, contractAddress);
    }
  }

  private startWebSocket(wssUrl: string, contractAddress: string): void {
    this.wsProvider = new WebSocketContractProvider({ wssUrl });
    this.unsubscribeTokenTransfer = this.wsProvider.onTokenTransfer(
      contractAddress,
      (event: TransferEvent) => {
        if (this.watchedWallets.has(event.from.toLowerCase())) {
          this.onInvalidateWallet(event.from);
        }
        if (this.watchedWallets.has(event.to.toLowerCase())) {
          this.onInvalidateWallet(event.to);
        }
      }
    );
    // Since WebSocketContractProvider only exposes onTokenTransfer specifically,
    // we would ideally need a generic eth_subscribe for other events like GuildOwnershipTransferred.
    // For now, we can only natively subscribe to token transfers using the existing SDK provider.
  }

  private startPolling(rpcUrl: string, contractAddress: string): void {
    this.httpProvider = new JsonRpcContractProvider(
      rpcUrl,
      this.config.fetch ?? globalThis.fetch,
      { 
        timeoutMs: this.config.timeoutMs ?? 10000 
      }
    );
    
    // Fetch initial block number to avoid polling from block 0
    this.httpProvider.request('eth_blockNumber', []).then((result) => {
      if (typeof result === 'string') {
        this.lastPolledBlock = parseInt(result, 16);
      }
    }).catch(() => {
      // Ignore initial fetch error, will retry on next poll
    });

    const intervalMs = this.config.watcher?.pollingIntervalMs ?? 10000;
    this.pollingInterval = setInterval(() => this.poll(contractAddress), intervalMs);
  }

  private async poll(contractAddress: string): Promise<void> {
    if (this.isPolling || !this.httpProvider) return;
    this.isPolling = true;
    try {
      const latestBlockHex = await this.httpProvider.request('eth_blockNumber', []) as string;
      const latestBlock = parseInt(latestBlockHex, 16);

      if (this.lastPolledBlock === 0) {
        this.lastPolledBlock = latestBlock;
        return;
      }

      if (latestBlock > this.lastPolledBlock) {
        const fromBlockHex = '0x' + (this.lastPolledBlock + 1).toString(16);
        const toBlockHex = latestBlockHex;

        const logs = await this.httpProvider.request('eth_getLogs', [{
          address: contractAddress,
          fromBlock: fromBlockHex,
          toBlock: toBlockHex,
        }]) as any[];

        for (const log of logs) {
          const topic0 = log.topics[0];
          if (topic0 === this.TRANSFER_TOPIC && log.topics.length >= 3) {
            const from = '0x' + log.topics[1].slice(26).toLowerCase();
            const to = '0x' + log.topics[2].slice(26).toLowerCase();
            
            if (this.watchedWallets.has(from)) {
              this.onInvalidateWallet(from);
            }
            if (this.watchedWallets.has(to)) {
              this.onInvalidateWallet(to);
            }
          } else if (topic0 === this.GUILD_OWNERSHIP_TRANSFERRED_TOPIC && log.topics.length >= 2) {
            // topic1 might be guildId
            const guildIdHex = log.topics[1];
            // guildId is stored as string in SDK (e.g. "my-guild"), so we'd need to match its keccak256 or directly match if the event is structured differently.
            // Since we don't have the exact ABI, if it matches any watched guild we could invalidate all watched guilds, or do a best-effort string match.
            // For now, if we see this event, invalidate all watched guilds as a conservative fallback.
            for (const guildId of this.watchedGuilds) {
              this.onInvalidateGuild(guildId);
            }
          }
        }
        
        this.lastPolledBlock = latestBlock;
      }
    } catch (err) {
      // Suppress polling errors to avoid crashing background loop
    } finally {
      this.isPolling = false;
    }
  }

  private checkTeardown(): void {
    if (this.watchedWallets.size === 0 && this.watchedGuilds.size === 0) {
      this.teardown();
    }
  }

  private teardown(): void {
    if (this.unsubscribeTokenTransfer) {
      this.unsubscribeTokenTransfer();
      this.unsubscribeTokenTransfer = null;
    }
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.httpProvider = null;
  }
}
