import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient, InMemoryCacheAdapter, AdaptiveContractProvider } from '../src';

describe('DiagnosticsModule', () => {
  it('should expose a unified snapshot with at least three operational states', async () => {
    const cache = new InMemoryCacheAdapter();
    const adaptiveProvider = new AdaptiveContractProvider({
      post: async () => ({ data: '0x' })
    } as any, ['http://rpc1.test']);

    const client = new GuildPassClient({
      apiUrl: 'https://api.test',
      cache,
      contractProvider: adaptiveProvider,
      rateLimit: { requestsPerSecond: 10 },
    });

    // Manually simulate in-flight requests to test the wiring
    (client as any).inFlightRequests.set('dummy1', Promise.resolve());
    (client as any).inFlightRequests.set('dummy2', Promise.resolve());

    const snap1 = client.diagnostics.getSnapshot();
    expect(snap1.inFlightRequests).toBe(2);

    // Simulate cache hit/miss to test wiring
    client.diagnostics.recordCacheHit('dummy');
    client.diagnostics.recordCacheMiss('dummy2');
    client.diagnostics.recordCacheMiss('dummy3');

    const snap2 = client.diagnostics.getSnapshot();
    expect(snap2.cache.hits).toBe(1);
    expect(snap2.cache.misses).toBe(2);

    // Rate limit
    expect(snap2.rateLimit).not.toBeNull();
    expect(snap2.rateLimit?.currentRate).toBeDefined();

    // Circuit breakers
    expect(snap2.circuitBreakers).toBeDefined();
  });

  it('should fire event emitter correctly for state transitions', async () => {
    const adaptiveProvider = new AdaptiveContractProvider({
      post: async () => ({ data: '0x' })
    } as any, ['http://rpc.test'], { health: { failureThreshold: 1, cooldownMs: 5000 } });

    const client = new GuildPassClient({
      apiUrl: 'https://api.test',
      contractProvider: adaptiveProvider,
    });

    const onCircuitOpen = vi.fn();
    client.diagnostics.on('circuitOpen', onCircuitOpen);

    // Manually trip the circuit breaker on the health tracker
    const tracker = (adaptiveProvider as any).healthTracker;
    tracker.recordFailure('http://rpc.test', Date.now());

    expect(onCircuitOpen).toHaveBeenCalled();
    const eventArg = onCircuitOpen.mock.calls[0][0];
    expect(eventArg.url).toBe('http://rpc.test');
    expect(eventArg.openUntil).toBeGreaterThan(Date.now());
  });
});
