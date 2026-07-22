# Adaptive, Rate-Limit-Aware Request Queue Implementation Workflow

This document outlines the implementation and testing process for adding adaptive, rate-limit-aware request queuing to the GuildPass SDK, addressing issue #305.

## Problem Statement

The GuildPass SDK lacked awareness of API rate limits, specifically 429 (Too Many Requests) responses and the `Retry-After` header. This could lead to applications making many concurrent calls triggering 429s, which were treated as generic failures instead of being intelligently paced and retried.

## Expected Outcome

The internal HTTP layer now recognizes 429 responses, honors any `Retry-After` header (or a sensible default backoff if absent), and queues/paces subsequent outgoing requests to avoid immediately re-triggering the same rate limit. This behavior is distinct from and coordinates with the circuit breaker. The current throttling state is also exposed via an optional diagnostics method.

## Implementation Steps

1.  **Analyze Existing HTTP Layer**:
    - Examined `src/http/httpClient.ts` to understand request/response handling and existing retry mechanisms.
    - Identified the `getRetryAfterMs` function for parsing `Retry-After` headers and the `TokenBucket` integration.
    - Noted that the existing retry logic for 429s directly delayed the current request, but a global pacing mechanism was needed.

2.  **Enhance `TokenBucket` (`src/http/tokenBucket.ts`)**:
    - **Added `retryUntil` property**: A private `retryUntil: number = 0;` was introduced to store the timestamp until which all requests should be throttled.
    - **Updated `onRateLimited`**: When a `retryAfterMs` is provided (from a 429 response), `retryUntil` is set to `Date.now() + retryAfterMs`. This ensures a hard cool-down period. The existing rate adjustment logic was retained for adaptive pacing after the hard throttle.
    - **Modified `acquire`**: The `acquire` method was updated to first check `retryUntil`. If `Date.now()` is less than `retryUntil`, it `await`s the remaining duration, effectively blocking all new requests until the cool-down period ends.
    - **Added `getThrottlingUntil`**: A public method was added to allow external components (e.g., for diagnostics or testing) to query the `retryUntil` timestamp.

3.  **Adjust `HttpClient` (`src/http/httpClient.ts`)**:
    - The direct `await delay(retryAfter ?? backoff);` call within the 429 handling block was removed. The responsibility for delaying requests based on `Retry-After` is now fully delegated to the `tokenBucket.acquire()` method, which applies the cool-down globally.

4.  **Verify `http.types.ts`**:
    - Confirmed that `src/http/http.types.ts` already correctly defines `RateLimitConfig` and includes `rateLimit?: RateLimitConfig;` within `HttpClientConfig`, meaning no changes were required here.

## Testing and Verification

Tests were added and modified in `tests/httpClient.test.ts` using `vitest`'s fake timers (`vi.useFakeTimers()`, `vi.advanceTimersByTime()`) to accurately simulate time-dependent behavior.

1.  **`respects Retry-After header on 429` (Modified)**:
    - Updated to use a realistic `Retry-After` value (e.g., 100ms).
    - Assertions were added to confirm that the retried request is delayed by at least the specified `Retry-After` duration.

2.  **`paces concurrent requests after a 429 with Retry-After` (New Test)**:
    - Simulates a scenario where a 429 is received, followed by a burst of concurrent requests.
    - Verifies that all subsequent requests are correctly held back and then released after the `Retry-After` period has elapsed, demonstrating the global pacing mechanism.

3.  **`exposes throttling state via getThrottlingUntil` (New Test)**:
    - Tests the `getThrottlingUntil()` method of the `TokenBucket` (accessed through `HttpClient`).
    - Asserts that `getThrottlingUntil()` accurately reflects the active throttling period after a 429 and resets once the cool-down is over.

## Acceptance Criteria Met

- A test simulating a 429 response with a `Retry-After` header results in the retried request being delayed by (at least) that duration before firing.
- A burst of many concurrent calls following a detected rate limit is demonstrably paced (verified via timing assertions in a test) rather than all firing immediately.
- Behavior is clearly distinguished from and doesn't conflict with the circuit breaker's failure-based tripping (the `TokenBucket` handles pacing, while the circuit breaker would handle outright, unrecoverable failures).

This implementation provides a robust and adaptive rate-limiting solution for the GuildPass SDK, significantly improving its resilience and behavior under high load or API restrictions.
