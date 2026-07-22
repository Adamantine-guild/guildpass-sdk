# GuildPass React Hooks Design

## Overview
This document describes the full design for the `@guildpass/react` package, which provides idiomatic React hooks for using the GuildPass SDK.

## Core Components

### GuildPassProvider
- Context provider to supply a single shared `GuildPassClient` instance to all child components
- Prevents duplicate client instantiation and ensures consistent config/caching across app

## Hook API Surface

### useAccessCheck
```typescript
const { data, error, isLoading, isFetching, refetch } = useAccessCheck({
  guildId: string;
  resourceId: string;
  walletAddress: string;
});
```
- Parameters: Same as `client.access.checkAccess()`
- Can be disabled by passing `null` for params
- Handles cancellation on unmount

### useMembership
```typescript
const { data, error, isLoading, isFetching, refetch } = useMembership({
  guildId: string;
  walletAddress: string;
});
```

### Planned Hooks (Future Work)

#### useRoleAccessCheck
```typescript
const { data, error, isLoading, isFetching, refetch } = useRoleAccessCheck({
  guildId: string;
  roleId: string;
  walletAddress: string;
});
```

#### useGuild
```typescript
const { data, error, isLoading, isFetching, refetch } = useGuild({
  guildId: string;
});
```

#### useGuildConfig
```typescript
const { data, error, isLoading, isFetching, refetch } = useGuildConfig({
  guildId: string;
});
```

#### useRoles
```typescript
const { data, error, isLoading, isFetching, refetch } = useRoles({
  guildId: string;
  cursor?: string;
  limit?: number;
});
```

#### useUserRoles
```typescript
const { data, error, isLoading, isFetching, refetch } = useUserRoles({
  guildId: string;
  walletAddress: string;
  cursor?: string;
  limit?: number;
});
```

#### useHasRole
```typescript
const { data, error, isLoading, isFetching, refetch } = useHasRole({
  guildId: string;
  roleId: string;
  walletAddress: string;
});
```

## useQuery Utility
All hooks share a common `useQuery` base that manages:
- Data/Error/Loading states
- Request cancellation on unmount
- Refetching
- Automatic re-fetching when params (dependency array) change
- IsFetching to indicate background re-fetching

## Error Handling
Errors are surfaced directly from the SDK's `GuildPassError` type, allowing users to switch on `error.code` to handle different cases.

## Caching
The hooks automatically use the caching layer from the provided `GuildPassClient`, so responses are shared across hook instances.
