import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuildPassClient, AuthenticationProvider, ApiKeyAuthenticationProvider } from '../src';

describe('Pluggable Authentication Providers', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'g1', name: 'Test Guild' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', mockFetch);
  });

  it('ApiKeyAuthenticationProvider generates correct headers', async () => {
    const provider = new ApiKeyAuthenticationProvider('test-key');
    const headers = await provider.getAuthorizationHeaders();
    expect(headers).toEqual({ 'X-API-Key': 'test-key' });
  });

  it('registers custom auth provider via builder', async () => {
    const mockProvider: AuthenticationProvider = {
      getAuthorizationHeaders: vi.fn().mockResolvedValue({ 'Authorization': 'Bearer custom-token' }),
    };

    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      authProvider: mockProvider,
      fetch: mockFetch,
      strictInterfaceChecking: false,
    });

    await (client as any).http.get('/test');

    expect(mockProvider.getAuthorizationHeaders).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.test.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer custom-token' }),
      })
    );
  });

  it('respects onUnauthorized hook and retries when true', async () => {
    let calls = 0;
    const capturedHeaders: Record<string, string>[] = [];
    mockFetch.mockImplementation(async (url: any, init: any) => {
      calls++;
      capturedHeaders.push({ ...init.headers });
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: 'g1', name: 'Test Guild' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    let tokenCalls = 0;
    const mockProvider: AuthenticationProvider = {
      getAuthorizationHeaders: vi.fn().mockImplementation(() => {
        tokenCalls++;
        return { 'Authorization': `Bearer token-${tokenCalls}` };
      }),
      onUnauthorized: vi.fn().mockResolvedValue(true),
    };

    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      authProvider: mockProvider,
      fetch: mockFetch,
      strictInterfaceChecking: false,
    });

    await (client as any).http.get('/test');

    expect(mockProvider.onUnauthorized).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Initial call uses first token
    expect(capturedHeaders[0]).toHaveProperty('Authorization', 'Bearer token-1');
    // Retry uses second token
    expect(capturedHeaders[1]).toHaveProperty('Authorization', 'Bearer token-2');
  });

  it('fails immediately on 401 if onUnauthorized returns false', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));

    const mockProvider: AuthenticationProvider = {
      getAuthorizationHeaders: vi.fn().mockResolvedValue({ 'Authorization': 'Bearer invalid-token' }),
      onUnauthorized: vi.fn().mockResolvedValue(false),
    };

    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      authProvider: mockProvider,
      fetch: mockFetch,
      strictInterfaceChecking: false,
    });

    await expect((client as any).http.get('/test')).rejects.toThrow();

    expect(mockProvider.onUnauthorized).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to default apiKey behaviour if no provider is passed', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      apiKey: 'legacy-key',
      fetch: mockFetch,
      strictInterfaceChecking: false,
    });

    await (client as any).http.get('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.test.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'legacy-key' }),
      })
    );
  });
});
