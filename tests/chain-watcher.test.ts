import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ChainWatcher } from '../src/chain/ChainWatcher';
import { GuildPassClientConfig } from '../src/config/sdkConfig';
import { JsonRpcContractProvider } from '../src/contracts/providers/jsonRpcProvider';
import { WebSocketContractProvider } from '../src/contracts/providers/webSocketProvider';

vi.mock('../src/contracts/providers/jsonRpcProvider');
vi.mock('../src/contracts/providers/webSocketProvider');

describe('ChainWatcher', () => {
  let mockInvalidateWallet: any;
  let mockInvalidateGuild: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockInvalidateWallet = vi.fn();
    mockInvalidateGuild = vi.fn();
    vi.mocked(JsonRpcContractProvider).mockClear();
    vi.mocked(WebSocketContractProvider).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createWatcher = (config: Partial<GuildPassClientConfig>) => {
    return new ChainWatcher({
      config: config as GuildPassClientConfig,
      onInvalidateWallet: mockInvalidateWallet,
      onInvalidateGuild: mockInvalidateGuild,
    });
  };

  it('initializes WebSocket subscription when WSS URL is provided', () => {
    const watcher = createWatcher({
      rpcUrl: 'wss://mainnet.infura.io/ws/v3/key',
      contractAddress: '0x1234567890123456789012345678901234567890'
    });
    
    watcher.watchWallet('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(WebSocketContractProvider).toHaveBeenCalledTimes(1);
    expect(JsonRpcContractProvider).not.toHaveBeenCalled();
    
    watcher.dispose();
  });

  it('initializes HTTP polling when HTTP URL is provided', () => {
    const watcher = createWatcher({
      rpcUrl: 'https://mainnet.infura.io/v3/key',
      contractAddress: '0x1234567890123456789012345678901234567890',
      watcher: { pollingIntervalMs: 1000 }
    });

    const mockRequest = vi.fn().mockResolvedValue('0x10'); // mock eth_blockNumber
    vi.mocked(JsonRpcContractProvider).mockImplementation(() => {
      return { request: mockRequest } as any;
    });

    watcher.watchGuild('guild-1');
    expect(JsonRpcContractProvider).toHaveBeenCalledTimes(1);
    expect(WebSocketContractProvider).not.toHaveBeenCalled();
    
    watcher.dispose();
  });

  it('cleans up resources on dispose', () => {
    const watcher = createWatcher({
      rpcUrl: 'wss://mainnet.infura.io/ws/v3/key',
      contractAddress: '0x1234567890123456789012345678901234567890'
    });

    const mockUnsubscribe = vi.fn();
    const mockDestroy = vi.fn();
    vi.mocked(WebSocketContractProvider).mockImplementation(() => {
      return { 
        onTokenTransfer: () => mockUnsubscribe,
        destroy: mockDestroy
      } as any;
    });

    watcher.watchWallet('0x1111111111111111111111111111111111111111');
    watcher.dispose();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
