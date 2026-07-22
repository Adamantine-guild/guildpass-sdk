# Redis Cache Adapter Example

This example demonstrates how to implement a fully compliant `CacheAdapter` using the official `redis` (v4) package.

It implements all required caching operations including the crucial `deleteByPrefix` using `scanIterator` to batch `UNLINK` commands, avoiding the blocking `KEYS` command.

## Usage

```typescript
import { GuildPassClient } from '@guildpass/sdk';
import { RedisCacheAdapter } from './src/index';

// 1. Create and connect your adapter
const cache = new RedisCacheAdapter('redis://localhost:6379');
await cache.connect();

// 2. Pass it to the GuildPass SDK
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  cache,
});

// The SDK will now use Redis for caching and deduplication.
```

## Testing

This directory includes a small integration test that runs the standard `CacheAdapter` conformance suite against the `RedisCacheAdapter`. It uses a custom `MockRedisClient` to avoid requiring a real Redis instance to be running.

```bash
npm run test
```
