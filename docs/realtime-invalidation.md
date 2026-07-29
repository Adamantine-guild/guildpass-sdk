# Real-Time Cache Invalidation

By default, the GuildPass SDK relies on a time-to-live (TTL) cache to serve read requests quickly. However, on-chain state like token transfers or guild ownership can change at any block.

For time-sensitive access gating use cases (e.g. immediately revoking access after a token is sold), the SDK provides a `ChainWatcher` component. This component can proactively monitor on-chain state and invalidate relevant cache entries in real-time, overriding the standard TTL.

## How it works

You can register interest in specific wallets or guilds:

```typescript
// Start watching a wallet for token transfer events
client.watchWallet('0x123...abc');

// Start watching a guild for ownership changes
client.watchGuild('my-guild');
```

Internally, the SDK will initialize the watcher and listen for relevant events. When a match is found, it will automatically call `client.invalidateWalletCache()` or `client.invalidateGuildCache()` respectively.

When you're done, you can stop watching specific entities or tear down the watcher entirely:

```typescript
// Stop watching a specific wallet
client.unwatchWallet('0x123...abc');

// Stop watching everything and tear down connections (important for clean exit)
client.stopWatching();
// or
client.dispose();
```

## Transport Strategies

The `ChainWatcher` supports two transports, selected automatically based on your `rpcUrl` config:

1. **WebSocket (`ws://` or `wss://`)**: 
   The SDK will use `eth_subscribe` to listen to real-time events. This is the recommended approach for persistent Node.js processes as it is the most efficient and responsive.
   
2. **HTTP Polling (`http://` or `https://`)**: 
   A fallback strategy that polls `eth_getLogs` on an interval. This is useful for environments where persistent WebSocket connections are not feasible (like Edge runtimes). You can configure the polling interval in the client config:

```typescript
const client = new GuildPassClient({
  // ...
  watcher: {
    pollingIntervalMs: 10000 // default is 10 seconds
  }
});
```

## Consistency Guarantees & Limitations

> [!WARNING]
> **Not Reorg-Proof:** The SDK's real-time invalidation is explicitly "best-effort". It does not handle deep chain reorganizations. If a transaction is reverted during a reorg, the cache will be invalidated when the event was first observed, and subsequent reads will reflect the most recent state.

- **Opt-in only:** Default SDK behavior is unchanged if you never call `watchWallet()` or `watchGuild()`.
- **Eventual Consistency:** A slight delay exists between the event firing on-chain and the API caching layer being invalidated locally.
