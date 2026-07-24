import { describe, it, expect, vi } from 'vitest';
import { WatchAndInvalidateService } from '../src/contracts/watchAndInvalidate';

describe('WatchAndInvalidateService', () => {
  it('should successfully register and clean up watchers', async () => {
    const mockClient: any = {
      invalidateWalletCache: vi.fn(),
    };

    const service = new WatchAndInvalidateService(mockClient);
    const unwatch = await service.watchAndInvalidate({
      chainId: 8453,
      contractAddress: '0x0000000000000000000000000000000000000000',
      onDegraded: (reason) => {
        expect(reason).toBeDefined();
      },
    });

    expect(typeof unwatch).toBe('function');
    unwatch();
  });
});
