# Request & Response Validation

This document describes the pattern used to validate the shape of data that
crosses the boundary between the SDK and the GuildPass API: request
parameters going out, and response bodies coming back in. It exists for
contributors adding a new service method or model, not for SDK consumers.

## Status

This pattern is applied incrementally, model by model. As of this writing,
request-schema validation covers every HTTP-based domain service call —
the full set of `this.http.get(...)` call sites across
`AccessService` (`checkAccess`, `checkRoleAccess`), `MembershipService`
(`getMembership`), `RolesService` (`getRoles`, `getUserRoles`), and
`GuildsService` (`getGuild`, `getGuildConfig`) — pairing every request
model with the response guard that already existed for it:

| Request guard (`requestGuards.ts`) | Response guard (`responseGuards.ts`) | Service method |
| --- | --- | --- |
| `isAccessCheckParams` | `isAccessCheckResult` | `AccessService.checkAccess` |
| `isRoleAccessCheckParams` | `isRoleCheckResult` | `AccessService.checkRoleAccess` |
| `isMembershipParams` | `isMembership` | `MembershipService.getMembership` |
| `isGetRolesParams` | `isGuildRoleArray` | `RolesService.getRoles` |
| `isGetUserRolesParams` | `isGuildRoleArray` | `RolesService.getUserRoles` |
| `isGetGuildParams` | `isGuild` | `GuildsService.getGuild` |
| `isGetGuildParams` | `isGuildConfig` | `GuildsService.getGuildConfig` |

`RolesService.hasRole` needs no guard of its own — it delegates to
`AccessService.checkRoleAccess`, which already validates.

**Out of scope**, deliberately: `ContractClient` / `src/contracts/` (reads
ABI-encoded data over raw JSON-RPC, not the GuildPass JSON API — see
`docs/architecture.md`), `src/siwe/` and `src/eip712/` (message parsing
with their own dedicated validation, not HTTP request/response models),
and the 3 `this.http.post(...)` call sites inside
`src/contracts/providers/jsonRpcProvider.ts` (raw JSON-RPC envelopes, not
domain models). Do not assume this pattern applies there without checking
first.

There is **no external schema/validation dependency** (no Zod, Valibot, ajv,
etc.). Everything is built on the zero-dependency combinator DSL in
`src/validation/schema.ts`: `string()`, `nonEmptyString()`, `number()`,
`boolean()`, `address()`, `object()`, `array()`, `optional()`, `record()`.
This is a deliberate choice, not an oversight — see "Why no external
library" below.

## The two halves

### Response validation

- **Guard**: a `Validator<T>` predicate for the response type, defined in
  `src/validation/responseGuards.ts` (e.g. `isAccessCheckResult`). Built by
  composing the `schema.ts` combinators; the field list must mirror the
  type it validates (`src/access/access.types.ts` for `AccessCheckResult`,
  etc.) — these are two separate declarations today, not derived from one
  another, so keep them in sync by hand when a type changes.
- **Enforcement**: `assertValidResponse(value, guard, typeName, { endpoint })`
  from `src/validation/assertResponse.ts`, called inside the service method
  after the HTTP response is parsed, right before it's returned to the
  caller.
- **On by default**: gated behind `GuildPassClientConfig.validateResponses`
  (default `true` as of the model pairs listed in "Status" above), threaded
  into each `*Service` constructor. Set `validateResponses: false` to
  restore the old unchecked behavior. Response guards must stay
  **permissive by construction** for this default to be safe — see
  "Unknown fields" below, and note that array fields validated with
  `array()` (not `nonEmptyArray()`) unless the model genuinely requires at
  least one element: `AccessCheckResult.requiredRoles`/`matchedRoles`, for
  example, are legitimately empty for a public resource or a wallet with no
  roles, and a guard requiring `nonEmptyArray()` there was a real bug found
  and fixed while making validation the default. Similarly, `optional()`
  accepts both `undefined` **and** `null` — a JSON API response can only
  omit a key or send `null`, never a literal `undefined`, so a combinator
  that only accepted `undefined` would reject the far more common shape of
  a real absent field (this was also a real bug, fixed alongside the array
  one). When adding a new guard, double-check every field against realistic
  API responses, not just the TypeScript type shape, before relying on this
  default.

### Request validation

- **Guard**: a `Validator<T>` predicate for the request parameters type, in
  `src/validation/requestGuards.ts` (e.g. `isAccessCheckParams`). These
  guards are **structural only** — they check that required fields are
  present and hold the right primitive type. They deliberately do **not**
  duplicate semantic checks (Ethereum address format/checksum, ID length
  limits, whitespace-only strings) that already live in
  `src/utils/validation.ts` (`validateAddress`, `validateGuildId`,
  `validateResourceId`, `validateRoleId`).
- **Enforcement**: `assertValidRequest(value, guard, typeName, { endpoint })`
  from `src/validation/assertRequest.ts`, called as the **first** line of
  the service method, before the params object is destructured and before
  the existing field-level validators run.
- **Not opt-in**: unlike response validation, this runs unconditionally.
  It's safe to make unconditional because it is provably a strict superset
  check relative to nothing (there was no structural check before) and a
  subset relative to the field validators that already run right after it
  — for any input that was already accepted by the old code path, the new
  guard also accepts it, because it only checks "is this the right
  primitive type", which the semantic validators require anyway. It only
  changes behavior for inputs that previously bypassed validation entirely,
  e.g. `service.checkAccess(null)`, which used to throw a raw
  `TypeError` from destructuring and now throws an actionable
  `GuildPassConfigError`.

**Ordering matters.** Keep request-schema validation *before* the
field-level validators, and keep the field-level validators unchanged. If
you're tempted to replace `validateAddress`/`validateGuildId`/etc. with a
single schema call, don't — those functions throw specific error codes
(`INVALID_ADDRESS` vs `INVALID_INPUT`) and enforce format/checksum/length
rules the structural schema does not, and tests assert on those exact
codes.

## Adding a schema for a new model

1. Add the response guard to `src/validation/responseGuards.ts`, matching
   the model's type in its `*.types.ts` file field-for-field.
2. If the method takes params, add the request guard to
   `src/validation/requestGuards.ts`, using only structural checks
   (`nonEmptyString()`, `number()`, `boolean()`, `optional(...)`,
   `array(...)`) — leave format/business-rule validation to
   `src/utils/validation.ts` or a new function there if the field is new.
3. Wire `assertValidRequest(...)` as the first line of the service method,
   and `assertValidResponse(...)` where the response is currently returned
   (respecting the existing `validateResponses` flag for the response half
   only — it's on by default, so double-check your new guard against
   realistic responses, not just the type shape, before wiring it in).
4. Export both guards from `src/index.ts` if — and only if — the model they
   validate is itself part of the public API (check `api-report/guildpass-sdk.api.md`
   or run `pnpm api-report` after building to confirm the new exports are
   intentional; `tests/api-report-diff.test.ts` fails the build if the
   public surface changes unexpectedly).
5. Add tests: a guard-predicate test file (mirror
   `tests/responseGuards.test.ts` / `tests/requestGuards.test.ts`), and, if
   the model is worth a dedicated round-trip/compat check, follow the
   pattern in `tests/serialization-compat.test.ts`.

## Unknown fields in responses

**Passthrough, always.** `object()` (the only combinator used by response
guards) validates the fields it's told about and ignores everything else —
it neither strips nor rejects extra keys. A server adding a new field to a
response is not a breaking change for SDK consumers: the guard still
passes, and the extra field rides along on the returned object exactly as
the API sent it, available to any consumer that reads it directly (even
though the SDK's TypeScript type doesn't declare it, so accessing it
requires a cast).

`strictObject()` (same file) is the strict counterpart — it rejects any key
not in the shape. It exists for local/internal shapes where an unexpected
key is genuinely a bug (e.g. validating your own config), and must **not**
be used for a response guard. Using it there would mean any new field the
API team ships breaks every SDK consumer until they upgrade — exactly the
failure mode this whole layer exists to avoid.

## Error shape

Both `assertValidResponse` and `assertValidRequest` throw on mismatch and
never return a `Result`/discriminated union — this matches every other
locally- and remotely-detected error in the SDK (`GuildPassConfigError`,
`GuildPassApiError`, etc.), so adding schema validation to a new model
never changes a method's return type.

- **Response mismatch** → `GuildPassResponseValidationError`
  (`code: INVALID_RESPONSE`).
- **Request mismatch** → `GuildPassConfigError` (`code: INVALID_INPUT`) —
  the same error class and code the existing field validators in
  `src/utils/validation.ts` already use, so `instanceof GuildPassConfigError`
  checks keep working for old and new validation failures alike.

Both attach structured `details` and a message built from three pieces:

```
<Invalid | Received a malformed> <TypeName> <request parameters | response>
 (<endpoint, if given>): <field path>: expected <X>, got <description of what arrived>
```

For example:

```
Invalid AccessCheckParams request parameters (GET /access/check): AccessCheckParams.resourceId: expected a non-empty string, got string ""
```

`error.details.mismatch` carries the same field-path explanation
programmatically; `error.details.received` carries the raw value that
failed — with one exception: on the request side, any top-level field whose
name matches a small sensitive-looking list (`apiKey`, `secret`,
`privateKey`, `password`, `token`, `signature`, case-insensitive) is
replaced with `'[REDACTED]'` before being attached, so a validation error
can never leak a credential into logs or error-reporting tools. Response
payloads are not redacted this way — they come from the server, not from
caller-supplied secrets.

## Why no external library

At audit time the SDK had zero runtime dependencies (`js-sha3` only) and a
21 KB budget for the main entrypoint (`bundle-size-budget.json`), enforced
by `pnpm size` in CI. It also ships and tests against three runtimes (Node,
browser via jsdom, edge via `edge-runtime`) — see "Runtime Compatibility" in
`docs/architecture.md`. Adding Zod, Valibot, or ajv would mean growing every
consumer's bundle (even tree-shaken, a general-purpose schema library costs
more than a handful of combinator functions built for exactly this SDK's
shapes) and re-verifying its behavior across all three runtimes. The
existing `schema.ts` DSL already provides object/array/optional
composition, field-path error explanations, and TypeScript inference
(`InferShape<S>`) — the properties that would motivate reaching for an
external library — at effectively zero bundle cost. Revisit this if a
future model needs something the DSL genuinely can't express (e.g.
discriminated unions across many variants); that's a real gap today
(`schema.ts` has no `union()`/`literal()` combinator yet) and should be
solved by extending the DSL first, before reaching for a dependency.
