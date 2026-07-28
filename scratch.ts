import { createPublicClient, custom, parseAbi } from 'viem';

const transport = custom({
  request: async ({ method, params }) => {
    if (method === 'eth_call') {
      return '0x...';
    }
  }
});
