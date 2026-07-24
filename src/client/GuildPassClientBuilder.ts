import { GuildPassClientConfig, validateConfig } from '../config/sdkConfig';
import { GuildPassClient } from './GuildPassClient';
import type { HttpTransport } from '../network/transport.types';
import type { CacheAdapter } from '../cache/cache.types';
import type { ContractProvider } from '../contracts/providers/provider.types';
import type { FetchLike, HttpHooks, Middleware, RateLimitConfig, RetryConfig } from '../http/http.types';
import type { ChainConfig, ContractReadConsensus } from '../contracts/contract.types';

export class GuildPassClientBuilder {
  private config: Partial<GuildPassClientConfig>;

  constructor(apiUrl?: string) {
    this.config = {};
    if (apiUrl) {
      this.config.apiUrl = apiUrl;
    }
  }

  public withApiUrl(apiUrl: string): this {
    this.config.apiUrl = apiUrl;
    return this;
  }

  public withApiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  public withTimeout(timeoutMs: number): this {
    this.config.defaultTimeoutMs = timeoutMs;
    // Keep timeoutMs in sync for backward compatibility, although defaultTimeoutMs takes precedence
    this.config.timeoutMs = timeoutMs;
    return this;
  }

  public withRetry(retry: RetryConfig): this {
    this.config.retry = retry;
    return this;
  }

  public withRateLimit(rateLimit: RateLimitConfig): this {
    this.config.rateLimit = rateLimit;
    return this;
  }

  public withTransport(transport: HttpTransport): this {
    this.config.transport = transport;
    return this;
  }

  public withFetch(fetchFn: FetchLike): this {
    this.config.fetch = fetchFn;
    return this;
  }

  public withHooks(hooks: HttpHooks): this {
    this.config.hooks = hooks;
    return this;
  }

  public withMiddleware(middleware: Middleware[]): this {
    this.config.middleware = middleware;
    return this;
  }

  public withCache(cache: CacheAdapter, ttlMs?: number): this {
    this.config.cache = cache;
    if (ttlMs !== undefined) {
      this.config.cacheTtl = ttlMs;
    }
    return this;
  }

  public withContractProvider(provider: ContractProvider): this {
    this.config.contractProvider = provider;
    return this;
  }

  public withRpcUrl(rpcUrl: string): this {
    this.config.rpcUrl = rpcUrl;
    return this;
  }

  public withRpcUrls(rpcUrls: string[]): this {
    this.config.rpcUrls = rpcUrls;
    return this;
  }

  public withChain(chainId: number, chainConfig: ChainConfig): this {
    if (!this.config.chains) {
      this.config.chains = {};
    }
    this.config.chains[chainId] = chainConfig;
    return this;
  }

  public withBatchStrategy(strategy: 'jsonrpc' | 'multicall3'): this {
    this.config.batchStrategy = strategy;
    return this;
  }

  public withContractReadConsensus(consensus: ContractReadConsensus): this {
    this.config.contractReadConsensus = consensus;
    return this;
  }

  public withDeduplication(enabled: boolean): this {
    this.config.deduplication = enabled;
    return this;
  }

  public withStrictAddressChecksum(enabled: boolean): this {
    this.config.strictAddressChecksum = enabled;
    return this;
  }

  public withStrictInterfaceChecking(enabled: boolean): this {
    this.config.strictInterfaceChecking = enabled;
    return this;
  }

  public withSignedResponses(enabled: boolean, trustedSignerAddress?: string): this {
    this.config.verifySignedResponses = enabled;
    if (trustedSignerAddress) {
      this.config.trustedSignerAddress = trustedSignerAddress;
    }
    return this;
  }

  public withClientMetadata(name: string, version: string): this {
    this.config.sendClientMetadata = true;
    this.config.clientName = name;
    this.config.clientVersion = version;
    return this;
  }

  public build(): GuildPassClient {
    // Validate config before constructing the client
    validateConfig(this.config as GuildPassClientConfig);
    return new GuildPassClient(this.config as GuildPassClientConfig);
  }
}
