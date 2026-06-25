// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../src/http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// GuildPass SDK: Test suite container block.
describe('HttpClient', () => {
  const baseUrl = 'https://api.test.com';
  let client: HttpClient;
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new HttpClient(baseUrl, undefined, 10000, {fetch: mockFetch});
    // GuildPass SDK: End of logic containment structure block.
  });

  // GuildPass SDK: Validate unit assertion test case.
  it('should use custom fetch implementation if provided', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'custom' }),
      headers: new Headers(),
    });

    const clientWithCustomFetch = new HttpClient(baseUrl, undefined, 10000, {fetch: customFetch});
    const result = await clientWithCustomFetch.get('/custom-path');

    expect(result).toEqual({ data: 'custom' });
    expect(customFetch).toHaveBeenCalledWith(
      expect.stringContaining('/custom-path'),
      expect.any(Object),
    );
  });

  it('should throw MISSING_FETCH error if no fetch implementation is available', () => {
    const originalFetch = globalThis.fetch;
    // @ts-ignore
    delete globalThis.fetch;

    try {
      expect(() => new HttpClient(baseUrl)).toThrow();
      try {
        new HttpClient(baseUrl);
      } catch (error: any) {
        expect(error.code).toBe(GuildPassErrorCode.MISSING_FETCH);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should make GET request with correct URL and headers', async () => {
    const mockResponse = { data: 'test' };
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers(),
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
      headers: new Headers(),
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
    const clientWithKey = new HttpClient(baseUrl, 'secret-key', 10000, undefined, mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
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
      headers: new Headers(),
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

  it('should throw GuildPassError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not Found' }),
      headers: new Headers(),
    });

    await expect(client.get('/not-found')).rejects.toMatchObject({
      code: GuildPassErrorCode.NOT_FOUND,
      status: 404,
    });
  });

  it('should surface API-provided message for 400 and 409', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid payload' }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'ALREADY_EXISTS', message: 'Conflict occurred' }),
        headers: new Headers(),
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
      headers: new Headers(),
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
          headers: new Headers(),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ ok: true }),
        });

      const result = await retryClient.get('/flaky');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    });

    it('throws after exhausting all retries', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 2,
        baseDelayMs: 0,
      });

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
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
        headers: new Headers(),
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
        headers: new Headers(),
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
          headers: new Headers(),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers(),
          json: () => Promise.resolve({ id: 1 }),
        });

      const result = await retryClient.post('/idempotent-create', {}, {
        retry: { maxRetries: 1, allowMutatingRetry: true, baseDelayMs: 0 },
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1 });
    });

    it('respects Retry-After header on 429', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 1,
        baseDelayMs: 1000,
      });

      // Retry-After: 0 means retry immediately — avoids real timer waits in tests.
      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '0' }),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ ok: true }),
        });

      const result = await retryClient.get('/rate-limited');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    });

    it('per-request retry config overrides global config', async () => {
      const retryClient = new HttpClient(baseUrl, undefined, 10000, {
        maxRetries: 3,
        baseDelayMs: 0,
      });

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: () => Promise.resolve(null),
      });

      // Per-request maxRetries=1 overrides global maxRetries=3
      await expect(
        retryClient.get('/flaky', { retry: { maxRetries: 1 } }),
      ).rejects.toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
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
        ok: false, status: 503, headers: new Headers(), json: () => Promise.resolve(null),
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
      ok: false, status: 503, headers: new Headers(),
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
        ok: false, status: 503, headers: new Headers(), json: () => Promise.resolve(null),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(), json: () => Promise.resolve({ ok: true }),
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
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest, onResponse }, mockFetch);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers(),
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
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest }, mockFetch);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers(),
    });

    await client.get('/ordering-test');

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not expose sensitive request details in hook payloads', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const client = new HttpClient(baseUrl, 'secret-key', 10000, { onRequest, onResponse, fetch: mockFetch });

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
    const client = new HttpClient(baseUrl, undefined, 10000, { onError }, mockFetch);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
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
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest, onResponse }, mockFetch);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
      headers: new Headers(),
    });

    const result = await client.get('/survive-hook');
    expect(result).toEqual({ success: true });
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

});

// Content-Type validation tests (issue #86)
describe('HttpClient Content-Type validation', () => {
  const baseUrl = 'https://api.test.com';
  let client: HttpClient;
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new HttpClient(baseUrl, undefined, 10000, { fetch: mockFetch });
  });

  it('should throw INVALID_CONTENT_TYPE when response has text/html content type and non-JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body>Error</body></html>'),
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      headers: new Headers({ 'Content-Type': 'text/html' }),
    });

    try {
      await client.get('/html-response');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.INVALID_CONTENT_TYPE);
      expect(error.message).toContain('text/html');
      expect(error.message).toContain('application/json');
    }
  });

  it('should throw INVALID_CONTENT_TYPE when response has text/plain content type and non-JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Internal Server Error'),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      headers: new Headers({ 'Content-Type': 'text/plain' }),
    });

    try {
      await client.get('/text-response');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.INVALID_CONTENT_TYPE);
      expect(error.message).toContain('text/plain');
    }
  });

  it('should still parse JSON body even with wrong content-type (graceful fallback)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'works' }),
      headers: new Headers({ 'Content-Type': 'text/plain' }),
    });

    const result = await client.get('/misconfigured-json');
    expect(result).toEqual({ data: 'works' });
  });

  it('should parse normally when content type is application/json', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const result = await client.get('/proper-json');
    expect(result).toEqual({ result: 'ok' });
  });

  it('should throw INVALID_CONTENT_TYPE when no content-type header and non-JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      headers: new Headers(),
    });

    try {
      await client.get('/no-content-type');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.INVALID_CONTENT_TYPE);
      expect(error.message).toContain('missing');
    }
  });

  it('should throw INVALID_RESPONSE when content-type is JSON but body is malformed', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token {')),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    try {
      await client.get('/malformed-json');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.INVALID_RESPONSE);
      expect(error.message).toContain('could not be parsed');
    }
  });
});
