import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '../src/http/httpClient';

describe('API key leakage protection (#119)', () => {
  it('attaches X-API-Key on relative GuildPass API requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient('https://api.guildpass.xyz', 'my-secret-key', 5000, { fetch: fetchMock });
    await client.get('/access/check');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'my-secret-key' }),
      }),
    );
  });

  it('does NOT attach X-API-Key on absolute external URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient('https://api.guildpass.xyz', 'my-secret-key', 5000, { fetch: fetchMock });
    await client.get('https://rpc.testnet.stellar.org');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://rpc.testnet.stellar.org'),
      expect.objectContaining({
        headers: expect.not.objectContaining({ 'X-API-Key': expect.anything() }),
      }),
    );
  });

  it('does NOT attach X-API-Key on absolute http URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient('https://api.guildpass.xyz', 'my-secret-key', 5000, { fetch: fetchMock });
    await client.get('http://some-rpc-provider.com/endpoint');

    const callArgs = fetchMock.mock.calls[0];
    const headers = callArgs[1]?.headers;
    expect(headers).toBeDefined();
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('does NOT attach X-API-Key on contract RPC (absolute) requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: '0x1234' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient('https://api.guildpass.xyz', 'my-secret-key', 5000, { fetch: fetchMock });
    await client.post('https://soroban-rpc.stellar.org', { jsonrpc: '2.0', id: 1, method: 'getLedgerEntries' });

    const callArgs = fetchMock.mock.calls[0];
    const headers = callArgs[1]?.headers;
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('does NOT leak real API key in error messages or hook payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'server error' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onError = vi.fn();
    const client = new HttpClient('https://api.guildpass.xyz', 'super-secret-live-key-12345', 5000, { fetch: fetchMock, hooks: { onError } });

    await expect(client.get('/access/check')).rejects.toThrow();

    // Verify the key is not leaked in the error output
    const errorPayload = onError.mock.calls?.[0]?.[0];
    if (errorPayload) {
      const serialized = JSON.stringify(errorPayload);
      expect(serialized).not.toContain('super-secret-live-key-12345');
    }
  });

  it('does NOT attach X-API-Key when apiKey is not configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HttpClient('https://api.guildpass.xyz', undefined, 5000, { fetch: fetchMock });
    await client.get('/access/check');

    const callArgs = fetchMock.mock.calls[0];
    const headers = callArgs[1]?.headers;
    expect(headers['X-API-Key']).toBeUndefined();
  });
});
