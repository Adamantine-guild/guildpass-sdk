import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '../src/http/tokenBucket';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows an immediate burst up to capacity', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 5, burst: 3 });
    // First 3 calls should resolve immediately (burst capacity)
    await expect(bucket.acquire()).resolves.toBeUndefined();
    await expect(bucket.acquire()).resolves.toBeUndefined();
    await expect(bucket.acquire()).resolves.toBeUndefined();
    // 4th call should block - no tokens left
    const p = bucket.acquire();
    // Advance time enough for 1 token at 5/s = 200ms
    vi.advanceTimersByTime(200);
    await expect(p).resolves.toBeUndefined();
  });

  it('paces calls to the configured rate', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 2 }); // 1 per 500ms, burst=2

    // Consume the burst
    await bucket.acquire();
    await bucket.acquire();

    // Next call should wait ~500ms
    const start = Date.now();
    const p = bucket.acquire();
    vi.advanceTimersByTime(499);
    // Should still be waiting
    const race = Promise.race([
      p.then(() => 'resolved'),
      Promise.resolve('timeout'),
    ]);
    await expect(race).resolves.toBe('timeout');

    vi.advanceTimersByTime(1); // total 500ms
    await expect(p).resolves.toBeUndefined();
  });

  it('onRateLimited reduces the effective rate', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 10, burst: 1 });

    bucket.onRateLimited(); // reduces rate by 20%

    // Consume the single token
    await bucket.acquire();

    // Wait time should be longer than 100ms (original 1/10s)
    const p = bucket.acquire();
    vi.advanceTimersByTime(124); // 100ms / 0.8 = 125ms
    const race = Promise.race([
      p.then(() => 'resolved'),
      Promise.resolve('timeout'),
    ]);
    await expect(race).resolves.toBe('timeout');
    vi.advanceTimersByTime(1);
    await expect(p).resolves.toBeUndefined();
  });

  it('onSuccess gradually restores the rate after rate limiting', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 10, burst: 1 });

    bucket.onRateLimited(); // 10 -> 8
    bucket.onSuccess(); // 8 -> 8.4

    // Consume the token
    await bucket.acquire();

    // Wait time should be based on 8.4 req/s (lower than original 10)
    const p = bucket.acquire();
    vi.advanceTimersByTime(119); // 1000/8.4 ≈ 119ms
    const race = Promise.race([
      p.then(() => 'resolved'),
      Promise.resolve('timeout'),
    ]);
    await expect(race).resolves.toBe('timeout');
    vi.advanceTimersByTime(1);
    await expect(p).resolves.toBeUndefined();
  });

  it('onRateLimited with Retry-After computes a safer rate', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 100, burst: 10 });

    // Retry-After: 2000ms means at most 0.5 req/s, so set to 0.4 req/s
    bucket.onRateLimited(2000);

    await bucket.acquire(); // consume token

    // Next token should take ~2500ms (1/0.4 = 2500ms)
    const p = bucket.acquire();
    vi.advanceTimersByTime(2499);
    const race = Promise.race([
      p.then(() => 'resolved'),
      Promise.resolve('timeout'),
    ]);
    await expect(race).resolves.toBe('timeout');
    vi.advanceTimersByTime(1);
    await expect(p).resolves.toBeUndefined();
  });

  it('does not exceed base rate after multiple onSuccess calls', async () => {
    const bucket = new TokenBucket({ requestsPerSecond: 10, burst: 1 });

    // Reduce then try to restore above base
    bucket.onRateLimited(); // 10 -> 8
    for (let i = 0; i < 100; i++) {
      bucket.onSuccess(); // each call multiplies by 1.05
    }

    await bucket.acquire();

    // Should be at most 100ms wait (original 10/s)
    const p = bucket.acquire();
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
  });

  it('burst defaults to requestsPerSecond', () => {
    const bucket = new TokenBucket({ requestsPerSecond: 5 });
    // Burst allows 5 immediate acquires
    expect(async () => {
      for (let i = 0; i < 5; i++) {
        await bucket.acquire();
      }
    }).not.toThrow();
  });
});
