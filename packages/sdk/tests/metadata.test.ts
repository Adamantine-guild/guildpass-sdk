// GuildPass SDK: Pull in package or module bindings.
import { describe, it, expect, vi, beforeEach } from 'vitest';
// GuildPass SDK: Import external module dependencies.
import { HttpClient } from '../src/http/httpClient';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassClient } from '../src/client/GuildPassClient';
import { SDK_VERSION } from '../src/config/version';

function mockFetch(headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true }),
    headers: new Headers(headers ?? { 'Content-Type': 'application/json' }),
  });
}

// GuildPass SDK: Test suite container block.
describe('SDK Client Metadata Headers', () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  // -----------------------------------------------------------------------
  // HttpClient: default behaviour
  // -----------------------------------------------------------------------

  it('should send SDK version header on relative API requests by default', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: { sdkVersion: SDK_VERSION, sendClientMetadata: true },
    });

    await client.get('/access/check');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
        }),
      }),
    );
  });

  it('should NOT send metadata headers to external absolute URLs', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientName: 'my-dapp',
        sendClientMetadata: true,
      },
    });

    await client.get('https://external-rpc.example.com/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://external-rpc.example.com/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-SDK-Version': expect.any(String),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://external-rpc.example.com/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-Client': expect.any(String),
        }),
      }),
    );
  });

  it('should NOT send API key to external absolute URLs', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', 'secret-key', 10000, {
      fetch: fetchMock,
      metadata: { sdkVersion: SDK_VERSION, sendClientMetadata: true },
    });

    await client.get('https://external-rpc.example.com/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://external-rpc.example.com/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-API-Key': expect.any(String),
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // HttpClient: custom client name / version
  // -----------------------------------------------------------------------

  it('should send X-GuildPass-Client header with client name', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientName: 'my-cool-dapp',
        sendClientMetadata: true,
      },
    });

    await client.get('/guilds');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/guilds'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
          'X-GuildPass-Client': 'my-cool-dapp',
        }),
      }),
    );
  });

  it('should send X-GuildPass-Client header with name and version', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientName: 'discord-bot',
        clientVersion: '2.4.1',
        sendClientMetadata: true,
      },
    });

    await client.get('/membership');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/membership'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
          'X-GuildPass-Client': 'discord-bot/2.4.1',
        }),
      }),
    );
  });

  it('should send X-GuildPass-Client with only version if name is omitted', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientVersion: '1.0.0',
        sendClientMetadata: true,
      },
    });

    await client.get('/roles');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/roles'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-Client': '1.0.0',
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // HttpClient: disabled metadata
  // -----------------------------------------------------------------------

  it('should not send any metadata headers when sendClientMetadata is false', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientName: 'hidden',
        sendClientMetadata: false,
      },
    });

    await client.get('/access/check');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-SDK-Version': expect.any(String),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-Client': expect.any(String),
        }),
      }),
    );
  });

  it('should not send version header when sdkVersion is empty string', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: '',
        clientName: 'my-dapp',
        sendClientMetadata: true,
      },
    });

    await client.get('/access/check');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-SDK-Version': expect.any(String),
        }),
      }),
    );
    // Client header should still be sent
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-Client': 'my-dapp',
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // HttpClient: metadata headers never leak sensitive data
  // -----------------------------------------------------------------------

  it('should never include API key in metadata headers', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', 'secret-token', 10000, {
      fetch: fetchMock,
      metadata: {
        sdkVersion: SDK_VERSION,
        clientName: 'secure-app',
        sendClientMetadata: true,
      },
    });

    await client.get('/access/check');

    const callArgs = fetchMock.mock.calls[0][1];
    const sentHeaders = callArgs.headers;

    // Metadata headers exist
    expect(sentHeaders['X-GuildPass-SDK-Version']).toBe(SDK_VERSION);
    expect(sentHeaders['X-GuildPass-Client']).toBe('secure-app');

    // Metadata headers should not contain API key or sensitive data
    const allMetadataValues = [
      sentHeaders['X-GuildPass-SDK-Version'],
      sentHeaders['X-GuildPass-Client'],
    ];
    for (const val of allMetadataValues) {
      expect(val).not.toContain('secret');
      expect(val).not.toContain('token');
      expect(val).not.toContain('0x');
    }
  });

  // -----------------------------------------------------------------------
  // HttpClient: metadata with POST requests
  // -----------------------------------------------------------------------

  it('should send metadata headers on POST requests', async () => {
    const client = new HttpClient('https://api.guildpass.xyz', undefined, 10000, {
      fetch: fetchMock,
      metadata: { sdkVersion: SDK_VERSION, sendClientMetadata: true },
    });

    await client.post('/access/check', { address: '0x123' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
        }),
      }),
    );
  });
});

// -----------------------------------------------------------------------
// GuildPassClient integration: metadata flows from config through to HttpClient
// -----------------------------------------------------------------------

describe('GuildPassClient metadata integration', () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('should send default SDK version header via GuildPassClient', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.access.checkAccess({
      walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beef',
      guildId: 'guild-1',
      resourceId: 'resource-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
        }),
      }),
    );
  });

  it('should send custom client name via GuildPassClient config', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      apiKey: 'test-key',
      clientName: 'superapp',
      clientVersion: '3.0.0',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.access.checkAccess({
      walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beef',
      guildId: 'guild-1',
      resourceId: 'resource-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GuildPass-SDK-Version': SDK_VERSION,
          'X-GuildPass-Client': 'superapp/3.0.0',
        }),
      }),
    );
  });

  it('should not send metadata when sendClientMetadata is false via GuildPassClient', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      apiKey: 'test-key',
      clientName: 'hidden-app',
      sendClientMetadata: false,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.access.checkAccess({
      walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beef',
      guildId: 'guild-1',
      resourceId: 'resource-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access/check'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-GuildPass-SDK-Version': expect.any(String),
        }),
      }),
    );
  });

  it('should expose metadata config via getConfig (non-sensitive)', () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      clientName: 'visible-app',
      sendClientMetadata: false,
    });

    const cfg = client.getConfig();
    expect(cfg.clientName).toBe('visible-app');
    expect(cfg.sendClientMetadata).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Config validation
// -----------------------------------------------------------------------

describe('Metadata config validation', () => {
  it('should accept valid metadata config', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      clientName: 'my-dapp',
      clientVersion: '1.0.0',
      sendClientMetadata: true,
    })).not.toThrow();
  });

  it('should accept config with metadata disabled', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      sendClientMetadata: false,
    })).not.toThrow();
  });

  it('should reject non-boolean sendClientMetadata', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      sendClientMetadata: 'yes' as any,
    })).toThrow(/sendClientMetadata must be a boolean/);
  });

  it('should reject non-string clientName', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      clientName: 123 as any,
    })).toThrow(/clientName must be a string/);
  });

  it('should reject non-string clientVersion', () => {
    expect(() => new GuildPassClient({
      apiUrl: 'https://api.guildpass.xyz',
      clientVersion: true as any,
    })).toThrow(/clientVersion must be a string/);
  });
});
