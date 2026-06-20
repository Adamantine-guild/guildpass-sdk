# API Reference

## Import Paths

The SDK supports tree-shakeable subpath imports. You can import focused modules directly to minimize your bundle size:

- `@guildpass/sdk/client`: Main `GuildPassClient` class.
- `@guildpass/sdk/errors`: Error classes and codes (`GuildPassError`, `GuildPassErrorCode`).
- `@guildpass/sdk/utils`: Utility functions (`normaliseAddress`, `validateAddress`, `formatIsoDate`, etc.).
- `@guildpass/sdk/types`: TypeScript definitions.

You can also import everything from the root `@guildpass/sdk`.

## GuildPassClient

The main constructor.

```typescript
new GuildPassClient(config: GuildPassClientConfig)
```

### Methods

- `getConfig()`: Returns the current configuration.

---

## Access Module (`client.access`)

### `checkAccess(params: AccessCheckParams)`

Checks if a wallet can access a resource.

- **Returns**: `Promise<AccessCheckResult>`

### `checkAccessBatch(items: AccessCheckParams[], options?: AccessCheckBatchOptions)`

Checks access for multiple resources or wallets concurrently.

- **Returns**: `Promise<AccessCheckBatchResult[]>`

### `checkRoleAccess(params: RoleAccessCheckParams)`

Checks if a wallet has a specific role.

- **Returns**: `Promise<boolean>`

---

## Membership Module (`client.membership`)

### `getMembership(params: MembershipParams)`

Fetches detailed membership status.

- **Returns**: `Promise<Membership>`

### `isMember(params: MembershipParams)`

Quick check for active membership.

- **Returns**: `Promise<boolean>`

---

## Roles Module (`client.roles`)

### `getRoles(params: GetRolesParams)`

Fetches all roles for a guild.

- **Returns**: `Promise<GuildRole[]>`

### `getUserRoles(params: GetUserRolesParams)`

Fetches roles assigned to a user.

- **Returns**: `Promise<GuildRole[]>`

---

## Guilds Module (`client.guilds`)

### `getGuild(params: GetGuildParams)`

Fetches basic guild metadata.

- **Returns**: `Promise<Guild>`

### `getGuildConfig(params: GetGuildParams)`

Fetches full guild configuration.

- **Returns**: `Promise<GuildConfig>`

---

## Response Validation

By default, service methods trust that the API response matches the
declared TypeScript return type. Since that's only a compile-time
guarantee, a malformed or incompatible response from the API (or a
misbehaving mock/proxy in front of it) would otherwise be returned to
your code as-is.

Set `validateResponses: true` in the client config to opt into runtime
checks on responses for the core public types (`AccessCheckResult`,
`Membership`, `GuildRole`, `Guild`, `GuildConfig`):

```typescript
const client = new GuildPassClient({
  apiUrl: '...',
  validateResponses: true,
});
```

When enabled, a response that doesn't match the expected shape causes
the SDK method to throw a `GuildPassError` with
`code: GuildPassErrorCode.INVALID_RESPONSE`, instead of silently
returning malformed data:

```typescript
try {
  await client.access.checkAccess({ ... });
} catch (error) {
  if (error instanceof GuildPassError && error.code === GuildPassErrorCode.INVALID_RESPONSE) {
    // The API returned a response that doesn't match AccessCheckResult.
  }
}
```

This flag defaults to `false` to preserve existing behaviour for
current consumers. The guards themselves (`isAccessCheckResult`,
`isMembership`, `isGuildRoleArray`, `isGuild`, `isGuildConfig`) are
also exported directly from the package if you want to validate
responses yourself without enabling the flag:

```typescript
import { isGuild } from '@guildpass/sdk';

if (!isGuild(someUnknownValue)) {
  // handle the malformed payload
}
```

The guards are hand-written, dependency-free type predicates — no
schema validation library is used, so enabling this option has a
negligible effect on bundle size.

## Contract Testing

The SDK maintains an API schema fixture to ensure request and response assumptions are valid. Contract tests (`tests/services.test.ts`) assert that SDK method parameters map to the correct API endpoint and match expected schema response structures.

When the API contract changes, you must update the fixture (`tests/fixtures/api-contract.json`) to reflect the new structure:

1. Locate the endpoint within `api-contract.json`.
2. Update the `request.path` or `request.query` array if parameters change.
3. Update the `response.success` object to match the new successful response.
4. Update the `response.error` object if error formats change.
5. Run `npm test` to verify your SDK methods conform to the new API schema.
