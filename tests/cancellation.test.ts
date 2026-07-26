import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { GuildPassCancellationError, GuildPassNetworkError } from '../src/errors/errorTypes';

const validAddress = '0x1234567890123456789012345678901234567890';
const accessParams = {
  walletAddress: validAddress,
  guildId: 'guild_1',
  resourceId: 'res_1',
};

const okAccessResponse = () => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      hasAccess: true,
      walletAddress: validAddress,
      guildId: accessParams.guildId,
      resourceId: accessParams.resourceId,
      requiredRoles: [],
      matchedRoles: [],
    }),
  headers: new Headers(),
});

const abortError = () => {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
};

describe('Caller cancellation via AbortSignal (#286)', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with a typed GuildPassCancellationError for a pre-aborted signal', async () => {
    const client = new GuildPassClient({ apiUrl: 'https://api.test.com', fetch: mockFetch });
    const controller = new AbortController();
    controller.abort();

    const promise = client.access.checkAccess(accessParams, { signal: controller.signal });
    await expect(promise).rejects.toBeInstanceOf(GuildPassCancellationError);
    await expect(promise).rejects.toMatchObject({
      name: 'GuildPassCancellationError',
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
    // Backward compatible: still a GuildPassNetworkError subclass.
    await expect(promise).rejects.toBeInstanceOf(GuildPassNetworkError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects with GuildPassCancellationError when aborted mid-flight', async () => {
    const client = new GuildPassClient({ apiUrl: 'https://api.test.com', fetch: mockFetch });
    const controller = new AbortController();

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(abortError()));
        setTimeout(() => controller.abort(), 10);
      });
    });

    const promise = client.access.checkAccess(accessParams, { signal: controller.signal });
    await expect(promise).rejects.toBeInstanceOf(GuildPassCancellationError);
    await expect(promise).rejects.toMatchObject({ code: GuildPassErrorCode.REQUEST_CANCELLED });
  });

  it('aborts promptly during retry backoff instead of sleeping through it', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
      retry: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 5000 },
    });
    const controller = new AbortController();

    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const promise = client.access.checkAccess(accessParams, { signal: controller.signal });
    // First attempt fails fast, then the client parks in a 1s backoff.
    // Aborting during that window must reject immediately, not after the sleep.
    setTimeout(() => controller.abort(), 100);

    await expect(promise).rejects.toBeInstanceOf(GuildPassCancellationError);
    await expect(promise).rejects.toMatchObject({ code: GuildPassErrorCode.REQUEST_CANCELLED });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not reject a coalesced caller when another caller aborts the same key', async () => {
    const client = new GuildPassClient({ apiUrl: 'https://api.test.com', fetch: mockFetch });
    const controller = new AbortController();

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(abortError()));
        setTimeout(() => resolve(okAccessResponse()), 50);
      });
    });

    const withSignal = client.access.checkAccess(accessParams, { signal: controller.signal });
    const withoutSignal = client.access.checkAccess(accessParams);

    setTimeout(() => controller.abort(), 10);

    await expect(withSignal).rejects.toBeInstanceOf(GuildPassCancellationError);
    await expect(withoutSignal).resolves.toMatchObject({ hasAccess: true });
    // The signalled call bypasses coalescing, so both hit the transport.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('Client-wide defaultTimeoutMs (#286)', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies defaultTimeoutMs to requests without a per-request override', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      defaultTimeoutMs: 50,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(abortError()));
      });
    });

    await expect(client.access.checkAccess(accessParams)).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 50ms',
    });
  });

  it('per-request timeoutMs still overrides defaultTimeoutMs', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      defaultTimeoutMs: 10000,
      fetch: mockFetch,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(abortError()));
      });
    });

    await expect(
      client.access.checkAccess(accessParams, { timeoutMs: 50 }),
    ).rejects.toMatchObject({
      code: GuildPassErrorCode.TIMEOUT,
      message: 'Request timed out after 50ms',
    });
  });

  it('rejects conflicting timeoutMs and defaultTimeoutMs at construction', () => {
    expect(
      () =>
        new GuildPassClient({
          apiUrl: 'https://api.test.com',
          timeoutMs: 5000,
          defaultTimeoutMs: 8000,
          fetch: mockFetch,
        }),
    ).toThrowError(/defaultTimeoutMs and timeoutMs are aliases/);
  });

  it('rejects a non-positive defaultTimeoutMs at construction', () => {
    expect(
      () =>
        new GuildPassClient({
          apiUrl: 'https://api.test.com',
          defaultTimeoutMs: 0,
          fetch: mockFetch,
        }),
    ).toThrowError(/defaultTimeoutMs must be a positive finite number/);
  });

  it('accepts equal timeoutMs and defaultTimeoutMs', () => {
    expect(
      () =>
        new GuildPassClient({
          apiUrl: 'https://api.test.com',
          timeoutMs: 5000,
          defaultTimeoutMs: 5000,
          fetch: mockFetch,
        }),
    ).not.toThrow();
  });
});
