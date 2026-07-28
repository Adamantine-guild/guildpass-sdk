import { test } from 'vitest';
import { createPublicClient, custom } from 'viem';

test('debug viem error', async () => {
  const publicClient = createPublicClient({
    transport: custom({
      request: async () => {
         const err = new Error('test error');
         // @ts-ignore
         err.status = undefined;
         throw err;
      }
    })
  });
  try {
     await publicClient.readContract({
       address: '0x0000000000000000000000000000000000000000',
       abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
       functionName: 'balanceOf',
       args: ['0x0000000000000000000000000000000000000000']
     });
  } catch (err: any) {
     console.error(err);
  }
});
