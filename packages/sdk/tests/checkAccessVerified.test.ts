import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import { ContractClient } from '../src/contracts/contractClient';
import { GuildPassError } from '../src/errors/GuildPassError';
import type { HttpClient } from '../src/http/httpClient';

const validAddress = '0x1234567890123456789012345678901234567890';
const requirement = { type: 'ROLE', id: 'role_1' } as const;

function createVerifiedService(
  apiResponse: any, 
  chainResponse: any, 
  apiError = false, 
  chainError = false, 
  hook?: any
) {
  const get = vi.fn();
  if (apiError) get.mockRejectedValue(new Error('API Error'));
  else get.mockResolvedValue(apiResponse);
  const http = { get } as unknown as HttpClient;

  const validateRoleRequirement = vi.fn();
  if (chainError) validateRoleRequirement.mockRejectedValue(new Error('Chain Error'));
  else validateRoleRequirement.mockResolvedValue(chainResponse);
  const contracts = { validateRoleRequirement } as unknown as ContractClient;

  return {
    get,
    validateRoleRequirement,
    service: new AccessService(http, false, contracts, hook),
  };
}

describe('AccessService.checkAccessVerified', () => {
  it('returns consistent=true when both sources agree on true', async () => {
    const { service } = createVerifiedService({ hasAccess: true }, true);
    const result = await service.checkAccessVerified(
      { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
      { requirement }
    );
    expect(result.consistent).toBe(true);
    expect(result.apiResult?.hasAccess).toBe(true);
    expect(result.onChainResult).toBe(true);
    expect(result.discrepancyReason).toBeUndefined();
  });

  it('returns consistent=true when both sources agree on false', async () => {
    const { service } = createVerifiedService({ hasAccess: false }, false);
    const result = await service.checkAccessVerified(
      { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
      { requirement }
    );
    expect(result.consistent).toBe(true);
  });

  it('returns consistent=false and triggers hook when results mismatch', async () => {
    const hook = vi.fn();
    const { service } = createVerifiedService({ hasAccess: true }, false, false, false, hook);
    
    const result = await service.checkAccessVerified(
      { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
      { requirement }
    );
    
    expect(result.consistent).toBe(false);
    expect(result.discrepancyReason).toContain('API returned true, but on-chain returned false');
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.stringContaining('API returned true, but on-chain returned false'),
      onChainResult: false
    }));
  });

  it('throws when throwOnDiscrepancy is true and results mismatch', async () => {
    const { service } = createVerifiedService({ hasAccess: false }, true);
    
    await expect(
      service.checkAccessVerified(
        { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
        { requirement, throwOnDiscrepancy: true }
      )
    ).rejects.toThrowError(GuildPassError);
  });

  it('flags inconsistency if API fails but chain succeeds', async () => {
    const { service } = createVerifiedService(null, true, true, false);
    const result = await service.checkAccessVerified(
      { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
      { requirement }
    );
    expect(result.consistent).toBe(false);
    expect(result.discrepancyReason).toContain('API request failed');
  });

  it('flags inconsistency if chain fails but API succeeds', async () => {
    const { service } = createVerifiedService({ hasAccess: true }, null, false, true);
    const result = await service.checkAccessVerified(
      { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
      { requirement }
    );
    expect(result.consistent).toBe(false);
    expect(result.discrepancyReason).toContain('On-chain request failed');
  });
  
  it('throws INVALID_CONFIG if ContractClient is missing', async () => {
    const service = new AccessService({} as HttpClient);
    await expect(
      service.checkAccessVerified(
        { walletAddress: validAddress, guildId: 'g1', resourceId: 'r1' },
        { requirement }
      )
    ).rejects.toThrow('ContractClient is not configured');
  });
});