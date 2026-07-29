import { describe, it, expect, vi, afterEach } from 'vitest';
import { FetchTransport } from '../src/network/fetchTransport';

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? { 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(body),
  } as Response;
}

describe('FetchTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses an explicitly passed fetch function', async () => {
    const explicitFetch = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    const transport = new FetchTransport(explicitFetch);

    await transport.execute({ url: 'https://api.test.com/x', method: 'GET', headers: {} });

    expect(explicitFetch).toHaveBeenCalledTimes(1);
  });

  it('resolves globalThis.fetch lazily at execute() time, not at construction time', async () => {
    // Construct the transport BEFORE any fetch is stubbed — this is exactly
    // the pattern GuildPassClient uses (HttpClient/FetchTransport are built
    // once, inside the constructor). A transport that captured
    // `globalThis.fetch` eagerly via a default parameter would permanently
    // keep whatever fetch existed at construction time, so a fetch installed
    // afterwards (a polyfill, or `vi.stubGlobal` in a test) would silently
    // never be used.
    const transport = new FetchTransport();

    const stubbedFetch = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    vi.stubGlobal('fetch', stubbedFetch);

    await transport.execute({ url: 'https://api.test.com/x', method: 'GET', headers: {} });

    expect(stubbedFetch).toHaveBeenCalledTimes(1);
  });

  it('picks up a fetch replacement even between two execute() calls on the same instance', async () => {
    const transport = new FetchTransport();

    const firstFetch = vi.fn().mockResolvedValue(mockResponse({ call: 1 }));
    vi.stubGlobal('fetch', firstFetch);
    await transport.execute({ url: 'https://api.test.com/a', method: 'GET', headers: {} });

    const secondFetch = vi.fn().mockResolvedValue(mockResponse({ call: 2 }));
    vi.stubGlobal('fetch', secondFetch);
    await transport.execute({ url: 'https://api.test.com/b', method: 'GET', headers: {} });

    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it('throws GuildPassConfigError when no fetch is available anywhere', async () => {
    vi.stubGlobal('fetch', undefined);
    const transport = new FetchTransport();

    await expect(
      transport.execute({ url: 'https://api.test.com/x', method: 'GET', headers: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('extracts headers via forEach when available', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mockResponse({}, { headers: { 'x-request-id': 'abc', 'content-type': 'application/json' } }));
    const transport = new FetchTransport(fetchFn);

    const response = await transport.execute({ url: 'https://api.test.com/x', method: 'GET', headers: {} });

    expect(response.getHeader('x-request-id')).toBe('abc');
    expect(response.getHeaders()).toMatchObject({ 'x-request-id': 'abc' });
  });
});
