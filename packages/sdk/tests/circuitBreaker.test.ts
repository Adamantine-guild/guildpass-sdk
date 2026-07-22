import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreakerManager } from '../src/http/circuitBreaker';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

describe('CircuitBreakerManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should trip to OPEN after failureThreshold is reached and skip retries', async () => {
    const cbManager = new CircuitBreakerManager({
      failureThreshold: 3,
      coolDownPeriodMs: 10000,
    });

    const endpoint = '/api/test';
    const mockFn = vi.fn().mockRejectedValue(
      new GuildPassError('Server error', GuildPassErrorCode.SERVER_ERROR)
    );

    // 1st failure
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Server error');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('CLOSED');

    // 2nd failure
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Server error');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('CLOSED');

    // 3rd failure (hits threshold)
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Server error');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('OPEN');
    expect(mockFn).toHaveBeenCalledTimes(3);

    // 4th call - should fail fast with SERVICE_UNAVAILABLE
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrowError(
      new GuildPassError(
        'Service is currently unavailable due to repeated failures',
        GuildPassErrorCode.SERVICE_UNAVAILABLE
      )
    );
    // Ensure the underlying function was NOT called again
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should transition to HALF_OPEN after coolDownPeriodMs and then recover to CLOSED on success', async () => {
    const cbManager = new CircuitBreakerManager({
      failureThreshold: 2,
      coolDownPeriodMs: 5000,
    });

    const endpoint = '/api/test';
    const mockFn = vi.fn().mockRejectedValue(
      new GuildPassError('Timeout', GuildPassErrorCode.TIMEOUT)
    );

    // Fail 2 times to open circuit
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Timeout');
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Timeout');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('OPEN');

    // Advance time by 4000ms (still OPEN)
    vi.advanceTimersByTime(4000);
    expect(cbManager.getDiagnostics()[endpoint]).toBe('OPEN');

    // Advance time to pass the 5000ms cool down
    vi.advanceTimersByTime(1001);
    expect(cbManager.getDiagnostics()[endpoint]).toBe('HALF_OPEN');

    // Set up success for next call
    mockFn.mockResolvedValueOnce('success');

    // The half-open call should succeed and close the circuit
    const result = await cbManager.execute(endpoint, mockFn);
    expect(result).toBe('success');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('CLOSED');
  });

  it('should re-trip immediately if the HALF_OPEN attempt fails', async () => {
    const cbManager = new CircuitBreakerManager({
      failureThreshold: 1,
      coolDownPeriodMs: 5000,
    });

    const endpoint = '/api/test';
    const mockFn = vi.fn().mockRejectedValue(
      new GuildPassError('Rate limited', GuildPassErrorCode.RATE_LIMITED)
    );

    // 1st failure trips circuit (threshold 1)
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Rate limited');
    expect(cbManager.getDiagnostics()[endpoint]).toBe('OPEN');

    // Advance past cool down
    vi.advanceTimersByTime(5001);
    expect(cbManager.getDiagnostics()[endpoint]).toBe('HALF_OPEN');

    // Attempt fails again
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Rate limited');
    
    // Circuit should be OPEN again immediately
    expect(cbManager.getDiagnostics()[endpoint]).toBe('OPEN');
  });

  it('should not trip circuit on non-transient errors', async () => {
    const cbManager = new CircuitBreakerManager({
      failureThreshold: 2,
      coolDownPeriodMs: 5000,
    });

    const endpoint = '/api/test';
    // INVALID_INPUT is a 4xx error (non-transient)
    const mockFn = vi.fn().mockRejectedValue(
      new GuildPassError('Bad Request', GuildPassErrorCode.INVALID_INPUT)
    );

    // Fail many times with 4xx
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Bad Request');
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Bad Request');
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Bad Request');
    await expect(cbManager.execute(endpoint, mockFn)).rejects.toThrow('Bad Request');

    // Circuit should remain CLOSED
    expect(cbManager.getDiagnostics()[endpoint]).toBe('CLOSED');
    expect(mockFn).toHaveBeenCalledTimes(4);
  });
});
