/**
 * Cross-provider consensus verification for on-chain reads (issue #307).
 *
 * The SDK accepts an opt-in `contractReadConsensus` config that lists
 * independent RPC endpoints and a quorum threshold. When set, every
 * supported on-chain read is fanned out across the listed endpoints in
 * parallel and only returns a value when at least `minProviders` of them
 * agree on the same raw hex result. On disagreement the SDK throws
 * `CONSENSUS_MISMATCH` whose `details` identify the lying provider(s).
 *
 * When the config is not set, every method falls back to its previous
 * behaviour (single-URL JSON-RPC with failover or Multicall3).
 *
 * Run with: pnpm tsx examples/consensus-verification.ts
 */
import { GuildPassClient, GuildPassErrorCode, ContractProvider } from '../src';

const BALANCE_RESPONSE_HEX =
  '0x000000000000000000000000000000000000000000000000000000000000002a'; // 42

async function main() {
  const walletAddress = '0x1234567890123456789012345678901234567890';
  const secondWallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const tokenContract = '0x000000000000000000000000000000000000beef';

  // Three independent RPC endpoints with a 2-of-3 quorum.
  //
  // "Independent" here means different infrastructure providers — using
  // multiple URLs that all proxy to the same backend would give a false
  // sense of diversity. Any reputable public RPC list will surface a lying
  // value because the operator's archive node has been tampered with.
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
    chainId: 8453, // Base
    contractAddress: tokenContract,
    contractReadConsensus: {
      providers: [
        'https://base.publicnode.com',
        'https://1rpc.io/base',
        'https://base-rpc.publicnode.com',
      ],
      minProviders: 2,
    },
  });

  // ---------------------------------------------------------------------
  // 1. Single-call read — fanout across all 3 providers.
  // ---------------------------------------------------------------------
  console.log('\n[1] Single-call read (getMembershipTokenBalance)');
  try {
    const balance = await client.contracts.getMembershipTokenBalance({ walletAddress });
    console.log(`  ✅ balance = ${balance} (verified by ≥2 providers)`);
  } catch (err) {
    handleConsensusError('getMembershipTokenBalance', err);
  }

  // ---------------------------------------------------------------------
  // 2. Batch read — per-item quorum; each wallet's balance verified
  //    independently. Items whose front-runner is below `minProviders`
  //    surface as `{ status: "error", error: "Consensus mismatch at
  //    batch index i: ..." }` rather than rejecting the whole batch.
  //    If every provider fails at the batch level, `CONSENSUS_MISMATCH`
  //    is thrown at the call site.
  // ---------------------------------------------------------------------
  console.log('\n[2] Batch read (getMembershipTokenBalancesBatch)');
  try {
    const batch = await client.contracts.getMembershipTokenBalancesBatch({
      walletAddresses: [walletAddress, secondWallet],
    });
    batch.forEach((item, i) => {
      if (item.status === 'success') {
        console.log(`  ✅ wallet[${i}] balance = ${item.result}`);
      } else {
        console.log(`  ❌ wallet[${i}] ${item.error}`);
      }
    });
  } catch (err) {
    handleConsensusError('getMembershipTokenBalancesBatch', err);
  }

  // ---------------------------------------------------------------------
  // 3. validateRoleRequirement — every internal `eth_call`
  //    (ERC-165 supportsInterface, ERC-20 balanceOf, ERC-721 ownerOf,
  //    AccessControl hasRole) also honours the consensus quorum. If the
  //    underlying call fails to reach quorum, `CONSENSUS_MISMATCH` is
  //    thrown just like a direct contract read.
  // ---------------------------------------------------------------------
  console.log('\n[3] validateRoleRequirement (consensus-routed internal calls)');
  try {
    const ok = await client.contracts.validateRoleRequirement({
      walletAddress,
      requirement: {
        type: 'TOKEN',
        address: tokenContract,
        minAmount: '1',
      },
    });
    console.log(ok ? '  ✅ role requirement satisfied' : '  ❌ role requirement not satisfied');
  } catch (err) {
    handleConsensusError('validateRoleRequirement', err);
  }

  // ---------------------------------------------------------------------
  // 4. Precedence chain — `contractProvider` overrides
  //    `contractReadConsensus` when configured. Use this when you have a
  //    custom aggregator (cache, fallback tree, signed-response backend)
  //    that you trust end-to-end and want to opt out of the cross-provider
  //    quorum for a specific client.
  //
  //    Set GUILDPASS_DEMO_CONTRACT_PROVIDER=1 to demo this path with the
  //    stub provider below; otherwise this section is skipped so the
  //    default run still exercises the live consensus reads above.
  // ---------------------------------------------------------------------
  console.log('\n[4] contractProvider override (precedence over consensus)');
  if (process.env.GUILDPASS_DEMO_CONTRACT_PROVIDER === '1') {
    const trustedProvider: ContractProvider = {
      ethCall: async () => BALANCE_RESPONSE_HEX,
      batchEthCall: async (reqs) => reqs.map(() => ({ status: 'success' as const, result: BALANCE_RESPONSE_HEX })),
    };

    const cachedClient = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      chainId: 8453,
      contractAddress: tokenContract,
      contractProvider: trustedProvider, // takes precedence over contractReadConsensus
    });

    const balance = await cachedClient.contracts.getMembershipTokenBalance({ walletAddress });
    console.log(`  ✅ balance = ${balance} (served by trusted custom provider)`);
  } else {
    console.log('  (skipped — set GUILDPASS_DEMO_CONTRACT_PROVIDER=1 to demo)');
  }
}

/**
 * Pretty-prints a consensus error so the operator can identify the lying
 * provider from `err.details.groups` / `err.details.failures`.
 */
function handleConsensusError(label: string, err: unknown): void {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === GuildPassErrorCode.CONSENSUS_MISMATCH
  ) {
    const details = (err as { details?: unknown }).details;
    console.error(`  ❌ ${label}: providers disagreed`);
    console.error(`     ${JSON.stringify(details, null, 2)}`);
  } else {
    console.error(`  ❌ ${label}: unexpected error`, err);
  }
}

main();
