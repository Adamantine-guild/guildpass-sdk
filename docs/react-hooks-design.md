# @guildpass/react: Official React Hooks Package Design Document

## Overview
This package provides a set of React hooks that wrap @guildpass/sdk service methods, exposing conventional `{ data, error, isLoading }` results, handling request cancellation, and reusing a shared `GuildPassClient` via context.

## Core Components

### 1. GuildPassProvider
A context provider that supplies a shared `GuildPassClient` instance to hooks in the component tree.

### 2. useGuildPassClient
A hook to access the `GuildPassClient` instance from the context.

## Hook API Surface
All hooks will follow the same pattern:
- Accept the same parameters as their underlying SDK method
- Return a `UseQueryResult` with `data`, `error`, `isLoading`, and a `refetch` function
- Use `AbortSignal` to cancel requests on unmount or refetch

### Planned Hooks

#### Access Module
- `useAccessCheck(params: AccessCheckParams)`
- `useAccessCheckBatch(items: AccessCheckParams[], options?: AccessCheckBatchOptions)`
- `useRoleAccessCheck(params: RoleAccessCheckParams)`

#### Membership Module
- `useMembership(params: MembershipParams)`
- `useIsMember(params: MembershipParams)`

#### Roles Module
- `useRoles(params: GetRolesParams)`
- `useUserRoles(params: GetUserRolesParams)`
- `useHasRole(params: HasRoleParams)`

#### Guilds Module
- `useGuild(params: GetGuildParams)`
- `useGuildConfig(params: GetGuildParams)`
