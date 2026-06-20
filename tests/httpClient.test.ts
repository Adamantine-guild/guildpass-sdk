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

  beforeEach(() => {
    client = new HttpClient(baseUrl);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-path?foo=bar'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('should include API key in headers if provided', async () => {
    const clientWithKey = new HttpClient(baseUrl, 'secret-key');
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });

    await clientWithKey.get('/test');

    expect(fetch).toHaveBeenCalledWith(
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
    (fetch as any).mockResolvedValue({
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
    (fetch as any).mockImplementation(() => {
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
});

describe('HttpClient Hooks', () => {
  const baseUrl = 'https://api.test.com';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should call onRequest and onResponse successfully', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest, onResponse });

    (fetch as any).mockResolvedValue({
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
      expect(fetch).not.toHaveBeenCalled();
    });
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest });

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers(),
    });

    await client.get('/ordering-test');

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should not expose sensitive request details in hook payloads', async () => {
    const onRequest = vi.fn();
    const client = new HttpClient(baseUrl, 'secret-key', 10000, { onRequest });

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });

    await client.post('/safe-test', { secret: 'value' });

    const payload = onRequest.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ method: 'POST', path: '/safe-test' }));
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('body');
  });

  it('should call onError when request fails and normalise error', async () => {
    const onError = vi.fn();
    const client = new HttpClient(baseUrl, undefined, 10000, { onError });

    (fetch as any).mockResolvedValue({
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
    const client = new HttpClient(baseUrl, undefined, 10000, { onRequest, onResponse });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    (fetch as any).mockResolvedValue({
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
