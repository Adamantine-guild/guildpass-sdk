/**
 * End-to-end coverage for the request/response schema pattern introduced
 * for `AccessCheckParams` (request) and `AccessCheckResult` (response) —
 * see docs/serialization-validation.md. These tests exist independently of
 * `access.service.test.ts` (call-site wiring) and `requestGuards.test.ts` /
 * `responseGuards.test.ts` (individual guard predicates) to pin down the
 * cross-cutting contract: round-tripping, the unknown-field policy, and
 * backward compatibility with payloads that predate this layer.
 */
import { describe, it, expect, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import { isAccessCheckResult } from '../src/validation/responseGuards';
import { isAccessCheckParams } from '../src/validation/requestGuards';
import { assertValidResponse } from '../src/validation/assertResponse';
import type { AccessCheckResult } from '../src/access/access.types';
import type { HttpClient } from '../src/http/httpClient';
import checkAccessSuccess from './fixtures/access/check-access-success.json';

describe('AccessCheckResult round-trip', () => {
  it('survives a JSON.stringify -> JSON.parse round trip and still validates', () => {
    const model: AccessCheckResult = {
      hasAccess: true,
      walletAddress: '0x1234567890123456789012345678901234567890',
      guildId: 'guild_1',
      resourceId: 'resource_1',
      requiredRoles: ['member'],
      matchedRoles: ['member'],
      reason: 'matched required role',
    };

    const roundTripped = JSON.parse(JSON.stringify(model));

    expect(roundTripped).toEqual(model);
    expect(isAccessCheckResult(roundTripped)).toBe(true);
  });
});

describe('AccessCheckResult unknown-field policy', () => {
  it('passes through a field the server added that the SDK does not model yet', () => {
    const withNewServerField = {
      ...checkAccessSuccess,
      // Simulates the API team shipping a new field before the SDK models it.
      expiresAt: '2026-12-31T00:00:00Z',
    };

    // Must still validate: rejecting here would break every consumer on
    // SDK upgrade day the API adds a field, before any SDK release ships
    // support for it. See docs/serialization-validation.md ("Unknown
    // fields") for the passthrough policy this asserts.
    expect(isAccessCheckResult(withNewServerField)).toBe(true);
    expect(() =>
      assertValidResponse(withNewServerField, isAccessCheckResult, 'AccessCheckResult'),
    ).not.toThrow();

    // The extra field is neither stripped nor rejected — it's returned as-is.
    const validated = assertValidResponse(withNewServerField, isAccessCheckResult, 'AccessCheckResult');
    expect((validated as any).expiresAt).toBe('2026-12-31T00:00:00Z');
  });
});

describe('AccessCheckResult error shape', () => {
  it('names the offending field, what was expected, and what was received', () => {
    try {
      assertValidResponse(
        { ...checkAccessSuccess, hasAccess: 'yes' },
        isAccessCheckResult,
        'AccessCheckResult',
        { endpoint: 'GET /access/check' },
      );
      throw new Error('expected assertValidResponse to throw');
    } catch (err: any) {
      expect(err.message).toContain('AccessCheckResult');
      expect(err.message).toContain('GET /access/check');
      expect(err.message).toContain('hasAccess');
      expect(err.details.mismatch).toContain('expected a boolean');
    }
  });
});

describe('Legacy payload compatibility', () => {
  it('a pre-existing fixture payload (captured before this layer existed) still passes both request and response validation', async () => {
    // `check-access-success.json` predates the request/response schema
    // work — it is the exact fixture `access.service.test.ts` already
    // relies on for the happy path. This test pins that it is untouched
    // by the new layer.
    expect(isAccessCheckResult(checkAccessSuccess)).toBe(true);

    const validParams = {
      walletAddress: '0x1234567890123456789012345678901234567890',
      guildId: 'guild_1',
      resourceId: 'resource_1',
    };
    expect(isAccessCheckParams(validParams)).toBe(true);

    const get = vi.fn().mockResolvedValue(checkAccessSuccess);
    const service = new AccessService({ get } as unknown as HttpClient);

    const result = await service.checkAccess(validParams);
    expect(result).toEqual(checkAccessSuccess);
  });
});
