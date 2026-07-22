// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../src/http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.guildpass.xyz';
const RPC_URL = 'https://rpc.third-party.io';
const CONTRACT = '0x0000000000000000000000000000000000000000';
const WALLET = '0x1234567890123456789012345678901234567890';

/** API keys used in tests are dummy placeholders — never real secrets. */
const DUMMY_KEY = 'gp_test_dummy_key_not_a_real_secret';

function mockJsonResponse(result: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(result),
  };
}

// ---------------------------------------------------------------------------
// HttpClient: relative vs absolute API key behaviour
// ---------------------------------------------------------------------------

describe('HttpClient API key protection', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  // -----------------------------------------------------------------------
  // Relative requests
  // -----------------------------------------------------------------------

  it('should include X-API-Key on relative requests when apiKey is configured (GET)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, { fetch: fetchMock });

    await client.get('/access/check');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': DUMMY_KEY }),
      }),
    );
  });

  it('should include X-API-Key on relative requests when apiKey is configured (POST)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, { fetch: fetchMock });

    await client.post('/membership', { address: WALLET });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/membership'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': DUMMY_KEY }),
      }),
    );
  });

  it('should NOT include X-API-Key on relative requests when apiKey is undefined', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    const client = new HttpClient(BASE_URL, undefined, 10000, { fetch: fetchMock });

    await client.get('/access/check');

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('X-API-Key');
  });

  it('should NOT include X-API-Key on relative requests when apiKey is empty string', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    // apiKey is falsy when empty string, so it should be omitted
    const client = new HttpClient(BASE_URL, '', 10000, { fetch: fetchMock });

    await client.get('/access/check');

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('X-API-Key');
  });

  // -----------------------------------------------------------------------
  // Absolute external URL requests
  // -----------------------------------------------------------------------

  it('should NOT attach X-API-Key to absolute external URLs', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ result: '0x00' }));
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, { fetch: fetchMock });

    await client.post(RPC_URL, { jsonrpc: '2.0', method: 'eth_call', params: [] });

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('X-API-Key');
    // Content-Type should still be set
    expect(callHeaders).toHaveProperty('Content-Type', 'application/json');
  });

  it('should NOT attach X-API-Key to multiple distinct absolute URLs', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ result: '0x00' }));
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, { fetch: fetchMock });

    await client.post('https://rpc.provider-a.io', { jsonrpc: '2.0', method: 'eth_call' });
    await client.post('https://rpc.provider-b.io', { jsonrpc: '2.0', method: 'eth_call' });
    await client.get('https://some-cdn.example/data.json');

    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers).not.toHaveProperty('X-API-Key');
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should NOT attach X-API-Key to absolute URLs even when apiKey is a long token', async () => {
    const longKey = 'gp_live_'.padEnd(80, 'x');
    fetchMock.mockResolvedValue(mockJsonResponse({ result: '0x00' }));
    const client = new HttpClient(BASE_URL, longKey, 10000, { fetch: fetchMock });

    await client.post('https://external.example.com/rpc', {});

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('X-API-Key');
  });

  // -----------------------------------------------------------------------
  // X-API-Key should NOT appear in hook payloads (redacted)
  // -----------------------------------------------------------------------

  it('should redact X-API-Key in onRequest hook payload', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    const onRequest = vi.fn();
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, {
      fetch: fetchMock,
      hooks: { onRequest },
    });

    await client.get('/secure-endpoint');

    expect(onRequest).toHaveBeenCalledTimes(1);
    const payload = onRequest.mock.calls[0][0];
    // The redacted headers preserve original key casing; X-API-Key → '[REDACTED]'
    expect(payload.headers['X-API-Key']).toBe('[REDACTED]');
    // The raw key value must never appear in the payload
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain(DUMMY_KEY);
  });

  it('should redact X-API-Key in onResponse hook payload', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));
    const onResponse = vi.fn();
    const client = new HttpClient(BASE_URL, DUMMY_KEY, 10000, {
      fetch: fetchMock,
      hooks: { onResponse },
    });

    await client.get('/secure-endpoint');

    expect(onResponse).toHaveBeenCalledTimes(1);
    const payload = onResponse.mock.calls[0][0];
    expect(payload.headers['X-API-Key']).toBe('[REDACTED]');
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain(DUMMY_KEY);
  });
});

// ---------------------------------------------------------------------------
// ContractClient: RPC requests must never leak X-API-Key
// ---------------------------------------------------------------------------

describe('ContractClient RPC API key protection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createClient(apiKey?: string) {
    return new GuildPassClient({
      apiUrl: BASE_URL,
      apiKey,
      rpcUrl: RPC_URL,
      contractAddress: CONTRACT,
    });
  }

  // -----------------------------------------------------------------------
  // getGuildOwner
  // -----------------------------------------------------------------------

  it('should NOT leak X-API-Key in getGuildOwner RPC request', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result: `0x000000000000000000000000${'9'.repeat(40)}`,
    }));

    const client = createClient(DUMMY_KEY);
    await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/rpc\.third-party\.io/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.not.objectContaining({ 'X-API-Key': expect.any(String) }),
      }),
    );
  });

  it('should NOT include any X-API-Key header in getGuildOwner request (key present)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      result: `0x000000000000000000000000${'9'.repeat(40)}`,
    }));

    const client = createClient(DUMMY_KEY);
    await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    // Assert the header key does not exist at all
    expect(Object.keys(callHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });

  it('should NOT include X-API-Key in getGuildOwner request (no key configured)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      result: `0x000000000000000000000000${'9'.repeat(40)}`,
    }));

    const client = createClient(); // no apiKey
    await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(callHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getMembershipTokenBalance
  // -----------------------------------------------------------------------

  it('should NOT leak X-API-Key in getMembershipTokenBalance RPC request', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      result: '0x000000000000000000000000000000000000000000000000000000000000002a',
    }));

    const client = createClient(DUMMY_KEY);
    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/rpc\.third-party\.io/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.not.objectContaining({ 'X-API-Key': expect.any(String) }),
      }),
    );
  });

  it('should NOT include X-API-Key header key at all in balance RPC request', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      result: '0x0000000000000000000000000000000000000000000000000000000000000007',
    }));

    const client = createClient(DUMMY_KEY);
    await client.contracts.getMembershipTokenBalance({ walletAddress: WALLET });

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(callHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // batchEthCall
  // -----------------------------------------------------------------------

  it('should NOT leak X-API-Key in batchEthCall RPC request', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([
      { jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' },
      { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000000002' },
    ]));

    const client = createClient(DUMMY_KEY);
    await client.contracts.batchEthCall(
      [
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
        { to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) },
      ],
      RPC_URL,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/rpc\.third-party\.io/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.not.objectContaining({ 'X-API-Key': expect.any(String) }),
      }),
    );
  });

  it('should NOT include X-API-Key header key at all in batch RPC request (key present)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([
      { jsonrpc: '2.0', id: 1, result: '0x01' },
    ]));

    const client = createClient(DUMMY_KEY);
    await client.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
    );

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(callHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });

  it('should NOT include X-API-Key in batch RPC request (no key configured)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([
      { jsonrpc: '2.0', id: 1, result: '0x01' },
    ]));

    const client = createClient(); // no apiKey
    await client.contracts.batchEthCall(
      [{ to: CONTRACT, data: '0x70a08231' + '0'.repeat(64) }],
      RPC_URL,
    );

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(callHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Mixed: SDK API calls SHOULD include the key
  // -----------------------------------------------------------------------

  it('should still include X-API-Key in regular SDK API calls alongside contract calls', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ hasAccess: true }))  // checkAccess
      .mockResolvedValueOnce(mockJsonResponse({                      // getGuildOwner
        result: `0x000000000000000000000000${'9'.repeat(40)}`,
      }));

    const client = createClient(DUMMY_KEY);

    // 1. SDK API call → should include key
    await client.access.checkAccess({
      walletAddress: WALLET,
      guildId: 'guild-1',
      resourceId: 'res-1',
    });

    // 2. RPC call → must NOT include key
    await client.contracts.getGuildOwner({ guildId: 'guild_1' });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call: SDK API (relative) → X-API-Key present
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty('X-API-Key', DUMMY_KEY);

    // Second call: RPC (absolute) → X-API-Key absent
    const rpcHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(Object.keys(rpcHeaders).some((k) => k.toLowerCase() === 'x-api-key')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Assertion safety: the dummy key is never a real secret
// ---------------------------------------------------------------------------

describe('API key assertion safety', () => {
  it('dummy test keys are obviously placeholders, not real secrets', () => {
    // If this fails someone accidentally committed a real key.
    // GuildPass API keys follow the pattern gp_test_* or gp_live_*.
    // These dummy values are deliberately obvious.
    expect(DUMMY_KEY).toContain('dummy');
    expect(DUMMY_KEY).toContain('not_a_real');
  });
});
