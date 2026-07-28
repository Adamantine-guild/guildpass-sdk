import { test } from 'vitest';
import { createPublicClient, custom } from 'viem';

test('debug viem retry', async () => {
  let count = 0;
  const publicClient = createPublicClient({
    transport: custom({
      request: async () => {
         count++;
         throw new Error('test error');
      }
    }, { retryCount: 0 })
  });
  try {
     await publicClient.readContract({
       address: '0x0000000000000000000000000000000000000000',
       abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
       functionName: 'balanceOf',
       args: ['0x0000000000000000000000000000000000000000']
     });
  } catch (err: any) {
  }
  console.log('COUNT:', count);
});
