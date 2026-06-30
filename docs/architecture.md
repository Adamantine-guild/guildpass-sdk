# SDK Architecture

The GuildPass SDK is designed to be lightweight, modular, and easy to extend.

## Core Components

### 1. GuildPassClient

The main entry point. It orchestrates the various services and holds the configuration.

### 2. HttpClient

A wrapper around the native `fetch` API. It handles:

- Base URL management
- API Key injection
- Timeout handling
- Error normalization
- JSON parsing

### 3. Services

Each service corresponds to a specific domain of the GuildPass protocol:

- **AccessService**: Handles `/access` endpoints.
- **MembershipService**: Handles `/membership` endpoints.
- **RolesService**: Handles `/guilds/:id/roles` endpoints.
- **GuildsService**: Handles `/guilds` configuration endpoints.

### 4. ContractClient

Designed for future on-chain support. Currently provides stubs and validation patterns for:

- Token balance checks
- On-chain role requirement validation
- Guild ownership lookup

### 5. Caching Layer

The SDK includes a resilient caching layer that wraps service methods.

- **CacheAdapter**: An interface for implementing custom cache backends (e.g., Redis).
- **InMemoryCacheAdapter**: A default, zero-dependency in-memory cache.
- **Resilience**: Caching is non-blocking and failure-tolerant. Cache errors are isolated from the main request flow.
- **Observability**: Developers can monitor cache health via lifecycle hooks.

## Data Flow

1. Developer initializes `GuildPassClient` with an optional `cache`.
2. Developer calls a method on a service (e.g., `client.access.checkAccess`).
3. If caching is enabled:
   - The SDK attempts to retrieve the value from the `cache`.
   - If successful (cache hit), the value is returned immediately.
   - If a cache failure occurs, the SDK logs the error via hooks and proceeds to the network.
4. Service validates input using `src/utils/validation.ts`.
5. Service calls `HttpClient` with the appropriate path and params.
6. `HttpClient` executes the fetch request.
7. If successful:
   - The SDK attempts to store the result in the `cache`.
   - If a cache failure occurs, the SDK logs the error via hooks and returns the response.
8. If the request fails, a `GuildPassError` is thrown with a specific `GuildPassErrorCode`.
9. The typed response is returned to the developer.

## Design Principles

- **Zero External Dependencies**: The SDK relies on native platform features (like `fetch` and `AbortController`) to keep the bundle size small.
- **Strong Typing**: Everything is typed with TypeScript for the best developer experience.
- **Fail Fast**: Input validation happens before network requests.
- **Environment Agnostic**: Works in Node.js, Browsers, and Edge runtimes.
