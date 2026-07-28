// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../src/http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassRateLimitError } from '../src/errors/errorTypes';

// GuildPass SDK: Test suite container block.
describe('HttpClient', () => {
  const baseUrl = 'https://api.test.com';
  let client: HttpClient;
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new HttpClient(baseUrl, undefined, 10000, {fetch: mockFetch});
    // GuildPass SDK: End of logic containment structure block.
  });

  // GuildPass SDK: Validate unit assertion test case.
  it('should use custom fetch implementation if provided', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'custom' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const clientWithCustomFetch = new HttpClient(baseUrl, undefined, 10000, {fetch: customFetch});
    const result = await clientWithCustomFetch.get('/custom-path');

    expect(result).toEqual({ data: 'custom' });
    expect(customFetch).toHaveBeenCalledWith(
      expect.stringContaining('/custom-path'),
      expect.any(Object),
    );
  });

  it('should throw an invalid config error if no fetch implementation is available', async () => {
    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal('fetch', undefined);
      const noFetchClient = new HttpClient(baseUrl);
      await expect(noFetchClient.get('/test')).rejects.toMatchObject({
        code: GuildPassErrorCode.INVALID_CONFIG,
      });
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('should make GET request with correct URL and headers', async () => {
    const mockResponse = { data: 'test' };
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const result = await client.get('/test-path', { params: { foo: 'bar' } });

    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-path?foo=bar'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('should use injected fetch transport without stubbing global fetch', async () => {
    const injectedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ via: 'custom-transport' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const transportClient = new HttpClient(baseUrl, undefined, 10000, {
      fetch: injectedFetch,
    });

    const result = await transportClient.get('/custom-fetch');

    expect(result).toEqual({ via: 'custom-transport' });
    expect(injectedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/custom-fetch'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('should throw a clear config error when no fetch transport is available', async () => {
    vi.unstubAllGlobals();
    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal('fetch', undefined);
      const noFetchClient = new HttpClient(baseUrl);
      await expect(noFetchClient.get('/missing-fetch')).rejects.toThrow(
        'A fetch-compatible transport is required.',
      );
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('should include API key in headers if provided', async () => {
    const clientWithKey = new HttpClient(baseUrl, 'secret-key', 10000, { fetch: mockFetch });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await clientWithKey.get('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret-key' }),
      }),
    );
  });

  it('should return undefined for 204 No Content responses', async () => {
    const json = vi.fn(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')));
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
      json,
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/empty')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('should return undefined for successful responses with explicit empty body metadata', async () => {
    const json = vi.fn(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')));
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json,
      headers: new Headers({ 'Content-Length': '0' }),
    });

    await expect(client.get('/empty-with-length')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('should still return parsed data for JSON responses', async () => {
    const mockResponse = { ok: true };
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/json')).resolves.toEqual(mockResponse);
  });

  it('should throw INVALID_RESPONSE for successful HTML responses', async () => {
    const json = vi.fn(() => Promise.resolve('<html>ok</html>'));
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json,
      headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
    });

    await expect(client.get('/html')).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
      status: 200,
      details: expect.objectContaining({
        reason: 'unexpected_content_type',
        contentType: 'text/html; charset=utf-8',
      }),
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('should throw INVALID_RESPONSE for malformed JSON success responses', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/bad-json')).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_RESPONSE,
      status: 200,
      message: 'Invalid response: received malformed JSON',
      details: expect.objectContaining({
        reason: 'malformed_json',
        contentType: 'application/json',
      }),
    });
  });

  it('should throw GuildPassError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not Found' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/not-found')).rejects.toMatchObject({
      code: GuildPassErrorCode.NOT_FOUND,
      status: 404,
    });
  });

  it('should return a safe GuildPassError for non-JSON error responses', async () => {
    const json = vi.fn();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
    });

    await expect(client.get('/plain-error')).rejects.toMatchObject({
      code: GuildPassErrorCode.SERVER_ERROR,
      status: 502,
      message: 'Endpoint returned a non-JSON error response',
      details: expect.objectContaining({
        code: GuildPassErrorCode.INVALID_RESPONSE,
        meta: expect.objectContaining({
          contentType: 'text/plain',
        }),
      }),
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('should return a safe GuildPassError for malformed JSON error responses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/malformed-error')).rejects.toMatchObject({
      code: GuildPassErrorCode.SERVER_ERROR,
      status: 500,
      message: 'Endpoint returned malformed JSON in an error response',
      details: expect.objectContaining({
        code: GuildPassErrorCode.INVALID_RESPONSE,
        meta: expect.objectContaining({
          contentType: 'application/json',
        }),
      }),
    });
  });

  it('should surface API-provided message for 400 and 409', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid payload' }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'ALREADY_EXISTS', message: 'Conflict occurred' }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

    await expect(client.get('/bad-request')).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
      status: 400,
      message: 'Invalid payload',
    });

    await expect(client.get('/conflict')).rejects.toMatchObject({
      code: GuildPassErrorCode.CONFLICT,
      status: 409,
      message: 'Conflict occurred',
    });
  });

  it('should combine messages from errors array', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ errors: [{ message: 'Name is required' }, { message: 'Email invalid' }] }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await expect(client.get('/validate')).rejects.toMatchObject({
      code: GuildPassErrorCode.INVALID_INPUT,
      status: 422,
      message: 'Name is required; Email invalid',
    });
  });

  it('should throw TIMEOUT error on abort', async () => {
    mockFetch.mockImplementation(() => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    await expect(client.get('/timeout')).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
    });
  });

  describe('retry', () => {
    it('retries a GET on a retryable status and succeeds', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 0,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const result = await retryClient.get('/flaky');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
      vi.useRealTimers();
    });

    it('final 429 error is a GuildPassRateLimitError carrying retryAfterMs', async () => {
      const noRetryClient = new HttpClient(baseUrl, undefined, 10000, {
        retry: { maxRetries: 0 },
      });

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '3' }),
        json: () => Promise.resolve({ error: 'quota exhausted' }),
      });

      const failure = await noRetryClient.get('/rate-limited').catch((e: any) => e);
      expect(failure).toBeInstanceOf(GuildPassRateLimitError);
      expect(failure.code).toBe(GuildPassErrorCode.RATE_LIMITED);
      expect(failure.status).toBe(429);
      expect(failure.retryAfterMs).toBe(3000);
      expect(failure.message).toBe('quota exhausted');
    });

    it('throws after exhausting all retries', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 0,
      });

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve(null),
      });

      await expect(retryClient.get('/always-down')).rejects.toMatchObject({
        code: GuildPassErrorCode.SERVER_ERROR,
        status: 503,
      });
      expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does not retry non-retryable status codes (404)', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, { maxRetries: 2 });

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve(null),
      });

      await expect(retryClient.get('/missing')).rejects.toMatchObject({
        code: GuildPassErrorCode.NOT_FOUND,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry POST by default', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 0,
      });

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve(null),
      });

      await expect(retryClient.post('/create', {})).rejects.toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries POST when allowMutatingRetry is set per-request', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, { baseDelayMs: 0 });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ id: 1 }),
        });

      const result = await retryClient.post('/idempotent-create', {}, {
        retry: { maxRetries: 1, allowMutatingRetry: true, baseDelayMs: 0 },
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1 });
    });

    it('respects Retry-After header on 429', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        retry: { maxRetries: 1, baseDelayMs: 1000 },
        rateLimit: { requestsPerSecond: 1000, burst: 1000 }, // High limits to not interfere with rate-limiting test
      });

      const retryAfterMs = 100;

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': String(retryAfterMs / 1000) }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/rate-limited');

      // Initial fetch call
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance timers by less than retryAfterMs, the second fetch should not have happened yet
      vi.advanceTimersByTime(retryAfterMs - 1);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance timers by retryAfterMs, the second fetch should now happen
      vi.advanceTimersByTime(1);
      const result = await requestPromise;

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
      vi.useRealTimers();
    });

    it('paces concurrent requests after a 429 with Retry-After', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        retry: { maxRetries: 1, baseDelayMs: 1000 },
        rateLimit: { requestsPerSecond: 1000, burst: 1000 }, // High limits to not interfere with rate-limiting test
      });

      const retryAfterMs = 200;

      // First request gets a 429
      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': String(retryAfterMs / 1000) }),
          json: () => Promise.resolve(null),
        })
        // Subsequent requests succeed
        .mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      // Fire the first request and let it receive the 429 so the bucket
      // enters its throttled state before the follow-up requests start.
      const request1Promise = retryClient.get('/rate-limited-1');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      const request2Promise = retryClient.get('/rate-limited-2');
      const request3Promise = retryClient.get('/rate-limited-3');

      // Both follow-ups are held by the throttle: no new fetches fire.
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance time just before the retryAfterMs period ends
      await vi.advanceTimersByTimeAsync(retryAfterMs - 1);
      expect(fetch).toHaveBeenCalledTimes(1); // Still only the first request

      // Advance time past the retryAfterMs period
      await vi.advanceTimersByTimeAsync(1);

      // Now all requests should have fired
      await Promise.all([request1Promise, request2Promise, request3Promise]);
      expect(fetch).toHaveBeenCalledTimes(4); // 1 initial + 1 retry + 2 paced

      vi.useRealTimers();
    });

    it('exposes throttling state via getThrottlingUntil', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        retry: { maxRetries: 1, baseDelayMs: 1000 },
        rateLimit: { requestsPerSecond: 1000, burst: 1000 },
      });

      const retryAfterMs = 300;

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': String(retryAfterMs / 1000) }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const initialThrottlingUntil = (retryClient as any).tokenBucket.getThrottlingUntil();
      expect(initialThrottlingUntil).toBe(0);

      const requestPromise = retryClient.get('/rate-limited-state');
      await vi.advanceTimersByTimeAsync(0);

      // After the 429, throttling should be active
      const throttlingUntilAfter429 = (retryClient as any).tokenBucket.getThrottlingUntil();
      expect(throttlingUntilAfter429).toBeGreaterThan(Date.now());
      expect(throttlingUntilAfter429).toBeLessThanOrEqual(Date.now() + retryAfterMs);

      vi.advanceTimersByTime(retryAfterMs);
      await requestPromise;

      // After the cool-down, throttling should be reset (or close to it)
      const throttlingUntilAfterCoolDown = (retryClient as any).tokenBucket.getThrottlingUntil();
      expect(throttlingUntilAfterCoolDown).toBe(0); // Should be reset to 0 after the delay

      vi.useRealTimers();
    });

    it('waits the computed backoff between status retries even without a rate limiter', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 1,
        baseDelayMs: 100,
        jitter: false,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/flaky-no-limiter');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      // The retry must not fire immediately (no hot loop).
      await vi.advanceTimersByTimeAsync(99);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const result = await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
      vi.useRealTimers();
    });

    it('prefers Retry-After over the computed backoff on status retries', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 1,
        baseDelayMs: 5000,
        jitter: false,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1', 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/retry-after-wins');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('doubles the backoff each attempt with jitter disabled', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitter: false,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/exponential');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      // First retry after 100ms.
      await vi.advanceTimersByTimeAsync(100);
      expect(fetch).toHaveBeenCalledTimes(2);

      // Second retry 200ms later, not sooner.
      await vi.advanceTimersByTimeAsync(199);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('caps the backoff at maxDelayMs with jitter disabled', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
        jitter: false,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/capped');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(2);

      // Second attempt would be 2000ms uncapped; the 1500ms ceiling applies.
      await vi.advanceTimersByTimeAsync(1499);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('keeps jittered delays within ±25% of the computed backoff', async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 1,
        baseDelayMs: 400,
      });

      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/jittered');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      // With random ~= 1 the delay is ~125% of 400ms = 500ms.
      await vi.advanceTimersByTimeAsync(499);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(2);

      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it('applies backoff between retries on network errors', async () => {
      vi.useFakeTimers();
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 1,
        baseDelayMs: 100,
        jitter: false,
      });

      (fetch as any)
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const requestPromise = retryClient.get('/network-flake');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(99);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await requestPromise;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
      vi.useRealTimers();
    });
  });

  describe('AbortSignal support', () => {
    it('short-circuits without calling fetch when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(client.get('/cancel', { signal: controller.signal })).rejects.toMatchObject({
        code: GuildPassErrorCode.REQUEST_CANCELLED,
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('throws REQUEST_CANCELLED when an external signal fires during fetch', async () => {
      const controller = new AbortController();

      (fetch as any).mockImplementation(() => {
        controller.abort();
        const error = new Error('AbortError');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        client.get('/cancel', { signal: controller.signal }),
      ).rejects.toMatchObject({
        code: GuildPassErrorCode.REQUEST_CANCELLED,
      });
    });

    it('throws TIMEOUT (not ABORTED) when only the timeout fires', async () => {
      (fetch as any).mockImplementation(() => {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(client.get('/timeout')).rejects.toMatchObject({
        code: GuildPassErrorCode.TIMEOUT,
      });
    });
  });
});

describe('HttpClient retry + hooks together', () => {
  const baseUrl = 'https://api.test.com';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries on a retryable status while still firing request/response hooks', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();

    const client = new HttpClient(baseUrl, undefined, 10000, {
      retry: { maxRetries: 2, baseDelayMs: 0 },
      hooks: { onRequest, onResponse, onError },
    });

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false, status: 503, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => Promise.resolve(null),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ ok: true }),
      });

    const result = await client.get('/flaky');

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2); // 1 failure + 1 retry
    // onRequest fires once, before the retry loop — not once per attempt.
    expect(onRequest).toHaveBeenCalledTimes(1);
    // onResponse fires once, on the eventually-successful attempt.
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    expect(onError).not.toHaveBeenCalled();
  });

  it('fires onError (and never onResponse) once retries are exhausted', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();

    const client = new HttpClient(baseUrl, undefined, 10000, {
      retry: { maxRetries: 2, baseDelayMs: 0 },
      hooks: { onRequest, onResponse, onError },
    });

    (fetch as any).mockResolvedValue({
      ok: false, status: 503, headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ message: 'still down' }),
    });

    await expect(client.get('/always-down')).rejects.toMatchObject({
      code: GuildPassErrorCode.SERVER_ERROR,
    });

    expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onResponse).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('backwards-compat: a bare RetryConfig (no hooks) still retries', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { maxRetries: 1, baseDelayMs: 0 });

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false, status: 503, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => Promise.resolve(null),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => Promise.resolve({ ok: true }),
      });

    const result = await client.get('/flaky');

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('HttpClient Hooks', () => {
  const baseUrl = 'https://api.test.com';
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('should call onRequest and onResponse successfully', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const client = new HttpClient(baseUrl, undefined, 10000, {
      hooks: { onRequest, onResponse },
      fetch: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await client.get('/hook-test');

    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/hook-test' }),
    );
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/hook-test',
        status: 200,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('should call onRequest before the network request is made', async () => {
    const onRequest = vi.fn().mockImplementation(() => {
      expect(mockFetch).not.toHaveBeenCalled();
    });
    const client = new HttpClient(baseUrl, undefined, 10000, {
      hooks: { onRequest },
      fetch: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    await client.get('/ordering-test');

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not expose sensitive request details in hook payloads', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const client = new HttpClient(baseUrl, 'secret-key', 10000, {
      hooks: { onRequest, onResponse },
      fetch: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers({ 'Set-Cookie': 'session=abc', 'Content-Type': 'application/json' }),
    });

    await client.post('/safe-test', { secret: 'value' }, {
      headers: { Authorization: 'Bearer token', Cookie: 'sid=123' }
    });

    const reqPayload = onRequest.mock.calls[0][0];
    expect(reqPayload).toEqual(expect.objectContaining({ method: 'POST', path: '/safe-test' }));
    expect(reqPayload).not.toHaveProperty('apiKey');
    expect(reqPayload).not.toHaveProperty('body');
    expect(reqPayload.headers['X-API-Key']).toBe('[REDACTED]');
    expect(reqPayload.headers['Authorization']).toBe('[REDACTED]');
    expect(reqPayload.headers['Cookie']).toBe('[REDACTED]');
    expect(reqPayload.headers['Content-Type']).toBe('application/json');

    const resPayload = onResponse.mock.calls[0][0];
    expect(resPayload.responseHeaders['set-cookie']).toBe('[REDACTED]');
    expect(resPayload.responseHeaders['content-type']).toBe('application/json');
  });

  it('should call onError when request fails and normalise error', async () => {
    const onError = vi.fn();
    const client = new HttpClient(baseUrl, undefined, 10000, {
      hooks: { onError },
      fetch: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    try {
      await client.get('/fail-test');
    } catch (e) {}

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/fail-test',
        durationMs: expect.any(Number),
        error: expect.objectContaining({
          status: 403,
        }),
      }),
    );
  });

  it('should not mask request result if hook throws', async () => {
    const onRequest = vi.fn().mockRejectedValue(new Error('Hook failed'));
    const onResponse = vi.fn().mockImplementation(() => {
      throw new Error('Hook failed sync');
    });
    const client = new HttpClient(baseUrl, undefined, 10000, {
      hooks: { onRequest, onResponse },
      fetch: mockFetch,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const result = await client.get('/survive-hook');
    expect(result).toEqual({ success: true });
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Response metadata (includeMeta) tests
// ---------------------------------------------------------------------------
describe('HttpClient includeMeta', () => {
  const baseUrl = 'https://api.test.com';
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns plain data by default (backwards-compatible)', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const result = await client.get<{ result: string }>('/test');
    expect(result).toEqual({ result: 'ok' });
    // Should be plain data, not { data, meta }
    expect(result).not.toHaveProperty('meta');
    expect(result).not.toHaveProperty('data');
  });

  it('returns { data, meta } when includeMeta: true on GET', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'ok' }),
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Request-ID': 'req-abc-123',
      }),
    });

    const result = await client.get<{ result: string }>('/test', { includeMeta: true });

    expect(result).toEqual({
      data: { result: 'ok' },
      meta: expect.objectContaining({
        status: 200,
        durationMs: expect.any(Number),
        requestId: 'req-abc-123',
      }),
    });
  });

  it('returns { data, meta } when includeMeta: true on POST', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'new-resource' }),
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Correlation-ID': 'corr-xyz-789',
      }),
    });

    const result = await client.post<{ id: string }>('/create', { name: 'test' }, { includeMeta: true });

    expect(result).toEqual({
      data: { id: 'new-resource' },
      meta: expect.objectContaining({
        status: 201,
        durationMs: expect.any(Number),
        correlationId: 'corr-xyz-789',
      }),
    });
  });

  it('captures traceparent header when present', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    const traceparentValue = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({
        'Content-Type': 'application/json',
        traceparent: traceparentValue,
      }),
    });

    const result = await client.get('/test', { includeMeta: true });

    expect(result).toHaveProperty('meta.traceId', traceparentValue);
  });

  it('captures x-trace-id header when present', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Trace-ID': 'trace-456-def',
      }),
    });

    const result = await client.get('/test', { includeMeta: true });

    expect(result).toHaveProperty('meta.traceId', 'trace-456-def');
  });

  it('meta fields are undefined when headers are missing', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const result = await client.get('/test', { includeMeta: true });

    expect(result).toEqual({
      data: { data: 'ok' },
      meta: expect.objectContaining({
        status: 200,
        durationMs: expect.any(Number),
      }),
    });
    // Diagnostic headers should be absent
    const meta = (result as any).meta;
    expect(meta.requestId).toBeUndefined();
    expect(meta.correlationId).toBeUndefined();
    expect(meta.traceparent).toBeUndefined();
    expect(meta.traceId).toBeUndefined();
  });

  it('does not leak sensitive headers in meta', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Request-ID': 'req-123',
        Authorization: 'Bearer secret-token',
        'X-API-Key': 'sk-sensitive',
        'Set-Cookie': 'session=abc123',
      }),
    });

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta;

    // Safe headers captured
    expect(meta.requestId).toBe('req-123');

    // Sensitive headers must NOT appear
    expect(meta).not.toHaveProperty('authorization');
    expect(meta).not.toHaveProperty('x-api-key');
    expect(meta).not.toHaveProperty('set-cookie');
  });

  it('meta includes accurate durationMs', async () => {
    const client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });

    mockFetch.mockImplementation(async () => {
      // Simulate a 50ms network round-trip
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };
    });

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta;

    expect(meta.durationMs).toBeGreaterThanOrEqual(50);
  });
});