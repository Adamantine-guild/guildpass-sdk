import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const WALLET = '0x1234567890123456789012345678901234567890';
const API_KEY = 'integration-secret';

type RequestRecord = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: IncomingMessage['headers'];
};

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function assertApiKey(request: IncomingMessage, response: ServerResponse) {
  if (request.headers['x-api-key'] !== API_KEY) {
    writeJson(response, 401, { error: 'Missing or invalid API key' });
    return false;
  }

  return true;
}

describe('GuildPassClient mock API integration', () => {
  let baseUrl: string;
  const requests: RequestRecord[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const query = Object.fromEntries(url.searchParams.entries());
    requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      query,
      headers: request.headers,
    });

    if (url.pathname !== '/guilds/..%2Fpublic%2Ferror' && url.pathname !== '/guilds/..%2Fpublic%2Fmalformed') {
      if (!assertApiKey(request, response)) return;
    }

    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (url.pathname === '/access/check') {
      expect(query).toEqual({ address: WALLET, guildId: 'guild space/1', resourceId: 'resource ?/1' });
      writeJson(response, 200, {
        hasAccess: true,
        walletAddress: query.address,
        guildId: query.guildId,
        resourceId: query.resourceId,
        requiredRoles: ['member'],
        matchedRoles: ['member'],
      });
      return;
    }

    if (url.pathname === '/access/role-check') {
      expect(query).toEqual({ address: WALLET, guildId: 'guild_1', roleId: 'role admin/1' });
      writeJson(response, 200, { hasRole: true });
      return;
    }

    if (url.pathname === '/membership') {
      expect(query).toEqual({ address: WALLET, guildId: 'guild_1' });
      writeJson(response, 200, {
        walletAddress: query.address,
        guildId: query.guildId,
        isActive: true,
        roles: ['member'],
      });
      return;
    }

    if (url.pathname === '/guilds/guild%20space%2F1/roles') {
      writeJson(response, 200, [{ id: 'role_1', name: 'Member' }]);
      return;
    }

    if (url.pathname === `/guilds/guild%20space%2F1/members/${WALLET}/roles`) {
      writeJson(response, 200, [{ id: 'role_2', name: 'Admin' }]);
      return;
    }

    if (url.pathname === '/guilds/guild%20space%2F1') {
      writeJson(response, 200, {
        id: 'guild space/1',
        name: 'Encoded Guild',
        ownerAddress: WALLET,
        chainId: 1,
      });
      return;
    }

    if (url.pathname === '/guilds/guild%20space%2F1/config') {
      writeJson(response, 200, { id: 'guild space/1', theme: 'dark' });
      return;
    }

    if (url.pathname === '/guilds/..%2Fpublic%2Ferror') {
      writeJson(response, 404, { error: 'No such resource' });
      return;
    }

    if (url.pathname === '/guilds/..%2Fpublic%2Fmalformed') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{not json');
      return;
    }

    writeJson(response, 500, { error: `Unhandled test route: ${url.pathname}` });
  });

  beforeAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('exercises SDK services through a real local HTTP boundary', async () => {
    const client = new GuildPassClient({ apiUrl: baseUrl, apiKey: API_KEY, validateResponses: true });

    await expect(
      client.access.checkAccess({
        walletAddress: WALLET,
        guildId: 'guild space/1',
        resourceId: 'resource ?/1',
      }),
    ).resolves.toMatchObject({ hasAccess: true, matchedRoles: ['member'] });
    await expect(
      client.access.checkRoleAccess({ walletAddress: WALLET, guildId: 'guild_1', roleId: 'role admin/1' }),
    ).resolves.toBe(true);
    await expect(client.membership.getMembership({ walletAddress: WALLET, guildId: 'guild_1' })).resolves.toMatchObject({ isActive: true });
    await expect(client.roles.getRoles({ guildId: 'guild space/1' })).resolves.toEqual([{ id: 'role_1', name: 'Member' }]);
    await expect(client.roles.getUserRoles({ guildId: 'guild space/1', walletAddress: WALLET })).resolves.toEqual([{ id: 'role_2', name: 'Admin' }]);
    await expect(client.guilds.getGuild({ guildId: 'guild space/1' })).resolves.toMatchObject({ name: 'Encoded Guild' });
    await expect(client.guilds.getGuildConfig({ guildId: 'guild space/1' })).resolves.toEqual({ id: 'guild space/1', theme: 'dark' });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': API_KEY }) }),
        expect.objectContaining({ path: '/guilds/guild%20space%2F1/roles' }),
        expect.objectContaining({ path: `/guilds/guild%20space%2F1/members/${WALLET}/roles` }),
      ]),
    );
  });

  it('surfaces HTTP error responses from the mock server', async () => {
    const client = new GuildPassClient({ apiUrl: baseUrl });

    await expect(client.guilds.getGuild({ guildId: '../public/error' })).rejects.toMatchObject({
      code: GuildPassErrorCode.NOT_FOUND,
      status: 404,
    });
  });

  it('normalises malformed JSON responses from the mock server', async () => {
    const client = new GuildPassClient({ apiUrl: baseUrl });

    await expect(client.guilds.getGuild({ guildId: '../public/malformed' })).rejects.toMatchObject({
      code: GuildPassErrorCode.HTTP_ERROR,
    });
  });

  it('aborts slow mock-server responses using the configured timeout', async () => {
    const slowServer = createServer((_request, _response) => {
      // Keep the request open until the client aborts it.
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const address = slowServer.address() as AddressInfo;
    const client = new GuildPassClient({ apiUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 10 });

    try {
      await expect(client.guilds.getGuild({ guildId: 'guild_1' })).rejects.toMatchObject({
        code: GuildPassErrorCode.TIMEOUT,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        slowServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
