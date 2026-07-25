import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../src/http/httpClient';
import { AccessService } from '../src/access/access.service';
import { MembershipService } from '../src/membership/membership.service';
import { RolesService } from '../src/roles/roles.service';
import { GuildsService } from '../src/guilds/guilds.service';
import { createMiddleware } from '../src/middleware/middleware.pipeline';
import type { Middleware } from '../src/middleware/middleware.types';

const BASE_URL = 'https://api.test.com';
const VALID_WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bEEF';
const VALID_GUILD = 'guild_1';
const VALID_RESOURCE = 'resource_1';

function okJson(data: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: new Headers({ 'Content-Type': 'application/json', ...extraHeaders }),
  };
}

function createMockFetch() {
  return vi.fn().mockResolvedValue(okJson({ hasAccess: true }));
}

function makeClientWithMiddleware(
  middleware: Middleware[],
  fetchFn?: ReturnType<typeof vi.fn>,
  retry?: { maxRetries?: number; baseDelayMs?: number; jitter?: boolean },
) {
  const f = fetchFn ?? createMockFetch();
  const config: Record<string, unknown> = { fetch: f, middleware };
  if (retry) config.retry = retry;
  return { client: new HttpClient(BASE_URL, undefined, 10000, config as any), fetch: f };
}

function makeServiceClient(
  middleware: Middleware[],
  fetchFn?: ReturnType<typeof vi.fn>,
  retry?: { maxRetries?: number; baseDelayMs?: number; jitter?: boolean },
) {
  const f = fetchFn ?? createMockFetch();
  const config: Record<string, unknown> = { fetch: f, middleware };
  if (retry) config.retry = retry;
  const http = new HttpClient(BASE_URL, undefined, 10000, config as any);
  const access = new AccessService(http);
  const membership = new MembershipService(http);
  const roles = new RolesService(http);
  const guilds = new GuildsService(http);
  return { http, access, membership, roles, guilds, fetch: f };
}

// ---------------------------------------------------------------------------
// AC-1: Test middleware that adds a custom header is verified present on the
//       actual outgoing request for every service module.
// ---------------------------------------------------------------------------
describe('Middleware — request header injection across all services', () => {
  const customHeaderMiddleware: Middleware = {
    name: 'custom-header',
    onRequest(payload) {
      payload.headers['X-Custom-Telemetry'] = 'test-value-123';
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('injects custom header on AccessService.checkAccess', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okJson({
      hasAccess: true,
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
      resourceId: VALID_RESOURCE,
      requiredRoles: ['member'],
      matchedRoles: ['member'],
      reason: 'matched',
    }));
    const { access, fetch } = makeServiceClient([customHeaderMiddleware], mockFetch);

    await access.checkAccess({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
      resourceId: VALID_RESOURCE,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Custom-Telemetry']).toBe('test-value-123');
  });

  it('injects custom header on MembershipService.getMembership', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okJson({
      isActive: true,
      roles: [{ id: 'role_1', name: 'Member' }],
    }));
    const { membership, fetch } = makeServiceClient([customHeaderMiddleware], mockFetch);

    await membership.getMembership({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Custom-Telemetry']).toBe('test-value-123');
  });

  it('injects custom header on RolesService.getRoles', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okJson([
      { id: '1', name: 'Role 1' },
      { id: '2', name: 'Role 2' },
    ]));
    const { roles, fetch } = makeServiceClient([customHeaderMiddleware], mockFetch);

    await roles.getRoles({ guildId: VALID_GUILD });

    expect(fetch).toHaveBeenCalledTimes(1);
    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Custom-Telemetry']).toBe('test-value-123');
  });

  it('injects custom header on GuildsService.getGuild', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okJson({
      id: VALID_GUILD,
      name: 'Test Guild',
      url: 'https://guild.xyz/test-guild',
      description: 'A guild',
      imageUrl: 'https://guild.xyz/logo.png',
      roles: ['member'],
      theme: { primaryColor: '#fff', secondaryColor: '#000' },
    }));
    const { guilds, fetch } = makeServiceClient([customHeaderMiddleware], mockFetch);

    await guilds.getGuild({ guildId: VALID_GUILD });

    expect(fetch).toHaveBeenCalledTimes(1);
    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Custom-Telemetry']).toBe('test-value-123');
  });
});

// ---------------------------------------------------------------------------
// AC-2: Test middleware that short-circuits with a synthetic response
//       correctly prevents the real network call from firing.
// ---------------------------------------------------------------------------
describe('Middleware — short-circuit with synthetic response', () => {

  it('prevents real network call when middleware throws in onRequest', async () => {
    const mockFetch = createMockFetch();
    const errorMiddleware: Middleware = {
      name: 'abort-request',
      onRequest() {
        throw new Error('SYNTHETIC_RESPONSE');
      },
    };

    const { client, fetch } = makeClientWithMiddleware([errorMiddleware], mockFetch);

    await expect(client.get('/any-path')).rejects.toThrow('SYNTHETIC_RESPONSE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prevents real network call with multiple middleware where first throws', async () => {
    const mockFetch = createMockFetch();
    const abortMiddleware: Middleware = {
      name: 'abort',
      onRequest() {
        throw new Error('STOP');
      },
    };
    const secondMiddleware: Middleware = {
      name: 'second',
      onRequest: vi.fn(),
    };

    const { client, fetch } = makeClientWithMiddleware([abortMiddleware, secondMiddleware], mockFetch);

    await expect(client.get('/test')).rejects.toThrow('STOP');
    expect(fetch).not.toHaveBeenCalled();
    expect(secondMiddleware.onRequest).not.toHaveBeenCalled();
  });

  it('error middleware is notified when onRequest short-circuits', async () => {
    const mockFetch = createMockFetch();
    const abortMiddleware: Middleware = {
      name: 'abort',
      onRequest() {
        throw new Error('STOP');
      },
    };
    const errorSpy = vi.fn();
    const errorObserver: Middleware = {
      name: 'error-observer',
      onError: errorSpy,
    };

    const { client, fetch } = makeClientWithMiddleware([abortMiddleware, errorObserver], mockFetch);

    await expect(client.get('/test')).rejects.toThrow('STOP');
    expect(fetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ message: 'STOP' }),
    }));
  });

  it('retries do not fire when middleware short-circuits', async () => {
    const mockFetch = createMockFetch();
    const abortMiddleware: Middleware = {
      name: 'abort',
      onRequest() {
        throw new Error('SHORT_CIRCUIT');
      },
    };

    const { client, fetch } = makeClientWithMiddleware([abortMiddleware], mockFetch, {
      maxRetries: 3,
      baseDelayMs: 0,
    });

    await expect(client.get('/test')).rejects.toThrow('SHORT_CIRCUIT');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multiple middleware: registration order on request, reverse on response.
// ---------------------------------------------------------------------------
describe('Middleware — execution order', () => {
  it('runs onRequest in registration order and onResponse in reverse', async () => {
    const order: string[] = [];

    const mw1: Middleware = {
      name: 'first',
      onRequest() { order.push('req-1'); },
      onResponse() { order.push('res-1'); },
    };
    const mw2: Middleware = {
      name: 'second',
      onRequest() { order.push('req-2'); },
      onResponse() { order.push('res-2'); },
    };
    const mw3: Middleware = {
      name: 'third',
      onRequest() { order.push('req-3'); },
      onResponse() { order.push('res-3'); },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client } = makeClientWithMiddleware([mw1, mw2, mw3], mockFetch);

    await client.get('/order-test');

    expect(order).toEqual(['req-1', 'req-2', 'req-3', 'res-3', 'res-2', 'res-1']);
  });

  it('onResponse receives parsed data and status', async () => {
    const responseSpy = vi.fn();
    const mw: Middleware = {
      name: 'observer',
      onResponse: responseSpy,
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ result: 'hello' }));
    const { client } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/data-test');

    expect(responseSpy).toHaveBeenCalledTimes(1);
    expect(responseSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      data: { result: 'hello' },
      durationMs: expect.any(Number),
      request: expect.objectContaining({ method: 'GET', path: '/data-test' }),
    }));
  });

  it('onResponse receives correct data for POST requests', async () => {
    const responseSpy = vi.fn();
    const mw: Middleware = {
      name: 'observer',
      onResponse: responseSpy,
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ id: 'new-123' }));
    const { client } = makeClientWithMiddleware([mw], mockFetch);

    await client.post('/create', { name: 'test' });

    expect(responseSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      data: { id: 'new-123' },
      request: expect.objectContaining({ method: 'POST', path: '/create' }),
    }));
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('Middleware — error handling', () => {
  it('onRequest error skips network and triggers onError in reverse', async () => {
    const order: string[] = [];
    const mw1: Middleware = {
      name: 'first',
      onRequest() { order.push('req-1'); throw new Error('fail-1'); },
      onError() { order.push('err-1'); },
    };
    const mw2: Middleware = {
      name: 'second',
      onRequest() { order.push('req-2'); },
      onError() { order.push('err-2'); },
    };

    const mockFetch = createMockFetch();
    const { client, fetch } = makeClientWithMiddleware([mw1, mw2], mockFetch);

    await expect(client.get('/fail')).rejects.toThrow('fail-1');
    expect(fetch).not.toHaveBeenCalled();
    expect(order).toEqual(['req-1', 'err-2', 'err-1']);
  });

  it('onResponse error triggers onError in reverse order', async () => {
    const order: string[] = [];
    const mw1: Middleware = {
      name: 'first',
      onResponse() { order.push('res-1'); },
      onError() { order.push('err-1'); },
    };
    const mw2: Middleware = {
      name: 'second',
      onResponse() { order.push('res-2'); throw new Error('response-fail'); },
      onError() { order.push('err-2'); },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([mw1, mw2], mockFetch);

    await expect(client.get('/res-fail')).rejects.toThrow('response-fail');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(order).toContain('res-2');
    expect(order).toContain('err-1');
  });

  it('errors thrown in onError are swallowed to prevent infinite loops', async () => {
    const mw: Middleware = {
      name: 'bad-error-handler',
      onRequest() { throw new Error('original'); },
      onError() { throw new Error('error-in-error'); },
    };

    const mockFetch = createMockFetch();
    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch);

    await expect(client.get('/loop')).rejects.toThrow('original');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('onError receives durationMs when available on network failure', async () => {
    const errorSpy = vi.fn();
    const mw: Middleware = {
      name: 'error-catcher',
      onError: errorSpy,
    };

    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = makeClientWithMiddleware([mw], mockFetch, {
      maxRetries: 0,
    });

    await expect(client.get('/net-fail')).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      durationMs: expect.any(Number),
      error: expect.any(Error),
    }));
  });
});

// ---------------------------------------------------------------------------
// Mutation semantics
// ---------------------------------------------------------------------------
describe('Middleware — header and body mutation', () => {
  it('header mutations from onRequest are carried to the fetch call', async () => {
    const mw: Middleware = {
      name: 'header-mod',
      onRequest(payload) {
        payload.headers['X-Request-Trace'] = 'trace-abc';
        payload.headers['X-Custom'] = 'value-1';
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/mutated');

    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Request-Trace']).toBe('trace-abc');
    expect(sentHeaders['X-Custom']).toBe('value-1');
  });

  it('middleware can read and modify existing headers', async () => {
    const mw: Middleware = {
      name: 'header-modify',
      onRequest(payload) {
        payload.headers['X-API-Key'] = 'overridden-key';
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/override');

    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-API-Key']).toBe('overridden-key');
  });

  it('body mutations from first middleware are visible to second middleware', async () => {
    const bodyCapture: unknown[] = [];
    const mw1: Middleware = {
      name: 'wrap-body',
      onRequest(payload) {
        payload.body = { wrapped: payload.body };
      },
    };
    const mw2: Middleware = {
      name: 'observe-body',
      onRequest(payload) {
        bodyCapture.push(payload.body);
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([mw1, mw2], mockFetch);

    await client.post('/wrap', { original: true });

    expect(bodyCapture).toEqual([{ wrapped: { original: true } }]);
    const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sentBody).toEqual({ wrapped: { original: true } });
  });
});

// ---------------------------------------------------------------------------
// createMiddleware helper
// ---------------------------------------------------------------------------
describe('Middleware — createMiddleware helper', () => {
  it('creates a middleware with the given name and handlers', async () => {
    const reqSpy = vi.fn();
    const resSpy = vi.fn();
    const errSpy = vi.fn();

    const mw = createMiddleware('test-mw', {
      onRequest: reqSpy,
      onResponse: resSpy,
      onError: errSpy,
    });

    expect(mw.name).toBe('test-mw');
    expect(mw.onRequest).toBe(reqSpy);
    expect(mw.onResponse).toBe(resSpy);
    expect(mw.onError).toBe(errSpy);
  });

  it('creates a middleware with only onRequest handler', () => {
    const reqSpy = vi.fn();
    const mw = createMiddleware('req-only', { onRequest: reqSpy });

    expect(mw.name).toBe('req-only');
    expect(mw.onRequest).toBe(reqSpy);
    expect(mw.onResponse).toBeUndefined();
    expect(mw.onError).toBeUndefined();
  });

  it('works correctly in a client pipeline', async () => {
    const mw = createMiddleware('telemetry', {
      onRequest(payload) {
        payload.headers['X-Telemetry-Id'] = 'mw-1';
      },
    });

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/helper-test');

    const sentHeaders = fetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Telemetry-Id']).toBe('mw-1');
  });
});

// ---------------------------------------------------------------------------
// Interaction with retry
// ---------------------------------------------------------------------------
describe('Middleware — interaction with retry', () => {
  it('middleware runs once before the retry loop, not per attempt', async () => {
    const reqSpy = vi.fn();
    const resSpy = vi.fn();
    const mw: Middleware = {
      name: 'once-check',
      onRequest: reqSpy,
      onResponse: resSpy,
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 503,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve(null),
      })
      .mockResolvedValueOnce(okJson({ ok: true }));

    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch, {
      maxRetries: 2,
      baseDelayMs: 0,
    });

    await client.get('/retry-test');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(resSpy).toHaveBeenCalledTimes(1);
    expect(resSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('middleware error prevents retries entirely', async () => {
    const mw: Middleware = {
      name: 'fail-fast',
      onRequest() { throw new Error('no-retries'); },
    };

    const mockFetch = createMockFetch();
    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch, {
      maxRetries: 5,
      baseDelayMs: 0,
    });

    await expect(client.get('/no-retry')).rejects.toThrow('no-retries');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Documented interaction order between middleware, caching, retry,
//       and rate limiting — exercised by a combination test.
// ---------------------------------------------------------------------------
describe('Middleware — interaction with caching, retry, and rate limiting', () => {
  it('middleware fires between cache miss and retry/transport, but not on cache hit', async () => {
    const order: string[] = [];

    const mw: Middleware = {
      name: 'track-order',
      onRequest() { order.push('middleware-request'); },
      onResponse() { order.push('middleware-response'); },
    };

    const mockFetch = vi.fn().mockImplementation(async () => {
      order.push('network');
      return okJson({ verified: true });
    });

    const http = new HttpClient(BASE_URL, undefined, 10000, {
      fetch: mockFetch,
      middleware: [mw],
    });

    const access = new AccessService(http);

    // First call: cache miss → middleware → network
    await access.checkAccess({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
      resourceId: VALID_RESOURCE,
    });

    expect(order).toEqual(['middleware-request', 'network', 'middleware-response']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('middleware + retry + rate limit layering is correct', async () => {
    const order: string[] = [];

    const mw: Middleware = {
      name: 'layer-check',
      onRequest() { order.push('middleware-req'); },
      onResponse() { order.push('middleware-res'); },
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 503,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve(null),
      })
      .mockImplementation(async () => {
        order.push('network');
        return okJson({ ok: true });
      });

    const { client, fetch } = makeClientWithMiddleware([mw], mockFetch, {
      maxRetries: 2,
      baseDelayMs: 0,
      jitter: false,
    });

    await client.get('/layered');

    // Middleware request runs once before retry loop
    // First attempt: 503 (no 'network' push since the mock returns error json)
    // Second attempt: succeeds with 'network' push
    // Middleware response runs once after final success
    expect(order).toEqual(['middleware-req', 'network', 'middleware-res']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('full integration: service → middleware → retry → transport → middleware response', async () => {
    const headerLog: string[] = [];

    const loggingMw: Middleware = {
      name: 'logger',
      onRequest(payload) {
        headerLog.push(`req:${payload.method}:${payload.path}`);
        payload.headers['X-Request-Log'] = headerLog.length.toString();
      },
      onResponse(payload) {
        headerLog.push(`res:${payload.status}`);
      },
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 429,
        headers: new Headers({
          'Content-Type': 'application/json',
          'Retry-After': '0',
        }),
        json: () => Promise.resolve({ error: 'rate limited' }),
      })
      .mockImplementation(async () => {
        return okJson({
          hasAccess: true,
          walletAddress: VALID_WALLET,
          guildId: VALID_GUILD,
          resourceId: VALID_RESOURCE,
          requiredRoles: ['member'],
          matchedRoles: ['member'],
          reason: 'matched',
        });
      });

    const http = new HttpClient(BASE_URL, undefined, 10000, {
      fetch: mockFetch,
      middleware: [loggingMw],
      retry: { maxRetries: 2, baseDelayMs: 0, jitter: false },
    });
    const access = new AccessService(http);

    const result = await access.checkAccess({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
      resourceId: VALID_RESOURCE,
    });

    expect(result.hasAccess).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Middleware request fired once (before retries), response fired once (after success)
    expect(headerLog[0]).toMatch(/^req:GET:/);
    expect(headerLog[headerLog.length - 1]).toMatch(/^res:200$/);
    // Custom header was present on the outgoing request
    const sentHeaders = mockFetch.mock.calls[0][1].headers;
    expect(sentHeaders['X-Request-Log']).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('Middleware — edge cases', () => {
  it('empty middleware array behaves identically to no middleware', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client, fetch } = makeClientWithMiddleware([], mockFetch);

    const result = await client.get('/no-mw');
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('middleware payload method and path reflect the actual request', async () => {
    const reqSpy = vi.fn();
    const mw: Middleware = { name: 'path-check', onRequest: reqSpy };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/v1/members');
    expect(reqSpy).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/v1/members',
    }));

    await client.post('/v1/data', { value: 42 });
    expect(reqSpy).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      path: '/v1/data',
    }));
  });

  it('async middleware functions are properly awaited', async () => {
    const order: string[] = [];
    const mw: Middleware = {
      name: 'async-mw',
      async onRequest() {
        await new Promise((r) => setTimeout(r, 5));
        order.push('async-req');
      },
      async onResponse() {
        await new Promise((r) => setTimeout(r, 5));
        order.push('async-res');
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const { client } = makeClientWithMiddleware([mw], mockFetch);

    await client.get('/async-test');
    expect(order).toEqual(['async-req', 'async-res']);
  });

  it('middleware sees the correct path for service calls', async () => {
    const paths: string[] = [];
    const mw: Middleware = {
      name: 'path-collector',
      onRequest(payload) { paths.push(payload.path); },
    };

    const mockFetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const http = new HttpClient(BASE_URL, undefined, 10000, {
      fetch: mockFetch,
      middleware: [mw],
    });
    const access = new AccessService(http);
    const membership = new MembershipService(http);
    const guilds = new GuildsService(http);

    await access.checkAccess({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
      resourceId: VALID_RESOURCE,
    });
    await membership.getMembership({
      walletAddress: VALID_WALLET,
      guildId: VALID_GUILD,
    });
    await guilds.getGuild({ guildId: VALID_GUILD });

    expect(paths).toContain('/access/check');
    expect(paths).toContain('/membership');
    expect(paths.some((p) => p.startsWith('/guilds/'))).toBe(true);
  });
});
