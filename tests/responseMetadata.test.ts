// GuildPass SDK: Response metadata feature tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../src/http/httpClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import type { ResponseMetadata, FetchLike } from '../src/http/http.types';

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  } as Response;
}

describe('Response Metadata', () => {
  let client: HttpClient;
  let mockFetch: ReturnType<typeof vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>>;

  beforeEach(() => {
    mockFetch = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>();
    client = new HttpClient('https://api.test.com', undefined, 10000, {
      fetch: mockFetch,
    });
  });

  // ---------------------------------------------------------------------------
  // Success: metadata captured from response headers
  // ---------------------------------------------------------------------------

  it('should return plain data when includeMeta is not set (backwards-compatible)', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, { foo: 'bar' }, { 'content-type': 'application/json' }),
    );

    const result = await client.get<{ foo: string }>('/test');

    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return { data, meta } when includeMeta is true', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, { foo: 'bar' }, {
        'content-type': 'application/json',
        'x-request-id': 'req-abc-123',
      }),
    );

    const result = await client.get<{ foo: string }>('/test', { includeMeta: true });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('meta');
    expect((result as any).data).toEqual({ foo: 'bar' });
    expect((result as any).meta.status).toBe(200);
    expect((result as any).meta.requestId).toBe('req-abc-123');
    expect(typeof (result as any).meta.durationMs).toBe('number');
  });

  it('should capture x-request-id header', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, {
        'content-type': 'application/json',
        'x-request-id': 'req-xyz-456',
      }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.requestId).toBe('req-xyz-456');
  });

  it('should capture x-correlation-id header', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-789',
      }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.correlationId).toBe('corr-789');
  });

  it('should capture traceparent header', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, {
        'content-type': 'application/json',
        'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.traceId).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  it('should capture all three diagnostic headers simultaneously', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, {
        'content-type': 'application/json',
        'x-request-id': 'req-all',
        'x-correlation-id': 'corr-all',
        'traceparent': '00-trace-all-01',
      }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.requestId).toBe('req-all');
    expect(meta.correlationId).toBe('corr-all');
    expect(meta.traceId).toBe('00-trace-all-01');
    expect(meta.status).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Missing headers: fields should be undefined
  // ---------------------------------------------------------------------------

  it('should return undefined for missing diagnostic headers', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, { 'content-type': 'application/json' }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.requestId).toBeUndefined();
    expect(meta.correlationId).toBeUndefined();
    expect(meta.traceId).toBeUndefined();
    expect(meta.status).toBe(200);
  });

  it('should still include status and durationMs even when headers are missing', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(201, { created: true }, { 'content-type': 'application/json' }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    expect(meta.status).toBe(201);
    expect(typeof meta.durationMs).toBe('number');
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // POST method
  // ---------------------------------------------------------------------------

  it('should return metadata for POST requests when includeMeta is true', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(201, { id: 'new-resource' }, {
        'content-type': 'application/json',
        'x-request-id': 'post-req-1',
      }),
    );

    const result = await client.post<{ id: string }>('/test', { name: 'foo' }, { includeMeta: true });

    expect((result as any).data).toEqual({ id: 'new-resource' });
    expect((result as any).meta.requestId).toBe('post-req-1');
    expect((result as any).meta.status).toBe(201);
  });

  it('should return plain data for POST when includeMeta is not set', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(201, { id: 'new-resource' }, {
        'content-type': 'application/json',
        'x-request-id': 'post-req-2',
      }),
    );

    const result = await client.post<{ id: string }>('/test', { name: 'foo' });

    expect(result).toEqual({ id: 'new-resource' });
  });

  // ---------------------------------------------------------------------------
  // Error path: metadata attached to GuildPassError
  // ---------------------------------------------------------------------------

  it('should attach metadata to GuildPassError on HTTP error responses', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(404, { error: 'Not found' }, {
        'content-type': 'application/json',
        'x-request-id': 'err-req-404',
        'x-correlation-id': 'err-corr-404',
      }),
    );

    try {
      await client.get('/not-found', { includeMeta: true });
      expect.fail('Expected error to be thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.NOT_FOUND);
      expect(error.requestMeta).toBeDefined();
      expect(error.requestMeta.requestId).toBe('err-req-404');
      expect(error.requestMeta.correlationId).toBe('err-corr-404');
      expect(error.requestMeta.status).toBe(404);
      expect(typeof error.requestMeta.durationMs).toBe('number');
    }
  });

  it('should attach metadata to GuildPassError on 500 errors', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(500, { error: 'Internal error' }, {
        'content-type': 'application/json',
        'x-request-id': 'err-req-500',
      }),
    );

    try {
      await client.get('/server-error');
      expect.fail('Expected error to be thrown');
    } catch (error: any) {
      expect(error.code).toBe(GuildPassErrorCode.SERVER_ERROR);
      expect(error.requestMeta).toBeDefined();
      expect(error.requestMeta.requestId).toBe('err-req-500');
      expect(error.requestMeta.status).toBe(500);
    }
  });

  it('should not have requestMeta for network/timeout errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    try {
      await client.get('/network-error');
      expect.fail('Expected error to be thrown');
    } catch (error: any) {
      expect(error.requestMeta).toBeUndefined();
    }
  });

  it('should not expose sensitive headers in metadata', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {}, {
        'content-type': 'application/json',
        'x-request-id': 'safe-req',
        'authorization': 'Bearer secret-token',
        'x-api-key': 'sk-very-secret',
        'set-cookie': 'session=abc123',
      }),
    );

    const result = await client.get('/test', { includeMeta: true });
    const meta = (result as any).meta as ResponseMetadata;

    // Only safe headers should be present
    expect(meta.requestId).toBe('safe-req');
    // The meta object itself should not contain any sensitive fields
    expect((meta as any).authorization).toBeUndefined();
    expect((meta as any)['x-api-key']).toBeUndefined();
    expect((meta as any)['set-cookie']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Non-JSON responses (204, 205)
  // ---------------------------------------------------------------------------

  it('should return metadata alongside undefined data for 204 responses', async () => {
    mockFetch.mockResolvedValue(
      mockResponse(204, null, {
        'x-request-id': 'req-204',
      }),
    );

    const result = await client.get('/no-content', { includeMeta: true });

    expect((result as any).data).toBeUndefined();
    expect((result as any).meta.requestId).toBe('req-204');
    expect((result as any).meta.status).toBe(204);
  });
});
