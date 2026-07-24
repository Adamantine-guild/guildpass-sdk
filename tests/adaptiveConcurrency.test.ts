import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../src/access/access.service';
import { AdaptiveConcurrencyController } from '../src/access/adaptiveConcurrency';
import type { AccessCheckParams, AccessCheckResult } from '../src/access/access.types';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import type { HttpClient } from '../src/http/httpClient';

const validAddress = '0x1234567890123456789012345678901234567890';

function makeItem(index: number): AccessCheckParams {
  return {
    walletAddress: validAddress,
    guildId: 'guild_1',
    resourceId: `resource_${index}`,
  };
}

const successResult: AccessCheckResult = {
  hasAccess: true,
  walletAddress: validAddress,
  guildId: 'guild_1',
  resourceId: 'resource_1',
  requiredRoles: ['member'],
  matchedRoles: ['member'],
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AdaptiveConcurrencyController', () => {
  it('starts at the initial limit and never grows past it', () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 3 });
    expect(controller.currentLimit).toBe(3);

    for (let i = 0; i < 20; i++) controller.recordSuccess();
    expect(controller.currentLimit).toBe(3);
  });

  it('halves the limit on HTTP 429, floored at the minimum', () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 5 });
    const rateLimited = GuildPassError.fromHttpError(429);

    controller.recordFailure(rateLimited);
    expect(controller.currentLimit).toBe(2);
    controller.recordFailure(rateLimited);
    expect(controller.currentLimit).toBe(1);
    controller.recordFailure(rateLimited);
    expect(controller.currentLimit).toBe(1);
  });

  it('shrinks on 5xx but ignores non-throttling failures', () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 8 });

    controller.recordFailure(GuildPassError.fromHttpError(503));
    expect(controller.currentLimit).toBe(4);

    controller.recordFailure(GuildPassError.fromHttpError(400));
    controller.recordFailure(new Error('socket hangup'));
    controller.recordFailure(undefined);
    expect(controller.currentLimit).toBe(4);
  });

  it('detects throttling by error code when no numeric status is present', () => {
    expect(
      AdaptiveConcurrencyController.isThrottlingError({ code: GuildPassErrorCode.RATE_LIMITED }),
    ).toBe(true);
    expect(
      AdaptiveConcurrencyController.isThrottlingError({ code: GuildPassErrorCode.SERVER_ERROR }),
    ).toBe(true);
    expect(
      AdaptiveConcurrencyController.isThrottlingError({ code: GuildPassErrorCode.INVALID_INPUT }),
    ).toBe(false);
  });

  it('grows additively: one step per currentLimit consecutive successes', () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 5 });

    controller.recordFailure(GuildPassError.fromHttpError(429));
    controller.recordFailure(GuildPassError.fromHttpError(429));
    expect(controller.currentLimit).toBe(1);

    controller.recordSuccess();
    expect(controller.currentLimit).toBe(2);

    controller.recordSuccess();
    expect(controller.currentLimit).toBe(2);
    controller.recordSuccess();
    expect(controller.currentLimit).toBe(3);
  });

  it('resets the success streak when a throttling failure arrives', () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 5 });
    controller.recordFailure(GuildPassError.fromHttpError(429));
    expect(controller.currentLimit).toBe(2);

    controller.recordSuccess();
    controller.recordFailure(GuildPassError.fromHttpError(429));
    expect(controller.currentLimit).toBe(1);

    controller.recordSuccess();
    expect(controller.currentLimit).toBe(2);
  });

  it('parks acquires beyond the limit until a slot is released', async () => {
    const controller = new AdaptiveConcurrencyController({ initialLimit: 1 });
    await controller.acquire();
    expect(controller.currentInFlight).toBe(1);

    let secondAcquired = false;
    const pending = controller.acquire().then(() => {
      secondAcquired = true;
    });
    await tick();
    expect(secondAcquired).toBe(false);

    controller.release();
    await pending;
    expect(secondAcquired).toBe(true);
    expect(controller.currentInFlight).toBe(1);
  });
});

describe('AccessService.checkAccessBatch adaptive concurrency', () => {
  it('reduces effective concurrency when the backend starts returning 429s', async () => {
    let inFlight = 0;
    let sawFailure = false;
    let maxConcurrentAfterFailure = 0;

    const get = vi.fn().mockImplementation(async () => {
      inFlight++;
      if (sawFailure) {
        maxConcurrentAfterFailure = Math.max(maxConcurrentAfterFailure, inFlight);
      }
      await tick();
      inFlight--;
      sawFailure = true;
      throw GuildPassError.fromHttpError(429);
    });
    const service = new AccessService({ get } as unknown as HttpClient);

    const items = Array.from({ length: 30 }, (_, i) => makeItem(i));
    const results = await service.checkAccessBatch(items, {
      concurrency: 5,
      adaptiveConcurrency: true,
    });

    expect(results).toHaveLength(30);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(get).toHaveBeenCalledTimes(30);
    expect(maxConcurrentAfterFailure).toBeLessThanOrEqual(2);
  });

  it('recovers gradually once errors stop', async () => {
    let calls = 0;
    let inFlight = 0;
    let maxConcurrentSuccesses = 0;

    const get = vi.fn().mockImplementation(async () => {
      calls++;
      const shouldFail = calls <= 10;
      inFlight++;
      if (!shouldFail) {
        maxConcurrentSuccesses = Math.max(maxConcurrentSuccesses, inFlight);
      }
      await tick();
      inFlight--;
      if (shouldFail) {
        throw GuildPassError.fromHttpError(429);
      }
      return successResult;
    });
    const service = new AccessService({ get } as unknown as HttpClient);

    const items = Array.from({ length: 30 }, (_, i) => makeItem(i));
    const results = await service.checkAccessBatch(items, {
      concurrency: 5,
      adaptiveConcurrency: true,
    });

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(10);
    expect(maxConcurrentSuccesses).toBeGreaterThanOrEqual(2);
  });

  it('leaves static concurrency as the default and matches non-adaptive behavior', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const get = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await tick();
      inFlight--;
      return successResult;
    });
    const service = new AccessService({ get } as unknown as HttpClient);

    const items = Array.from({ length: 12 }, (_, i) => makeItem(i));
    const results = await service.checkAccessBatch(items, { concurrency: 3 });

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(maxConcurrent).toBe(3);
  });

  it('still rejects in failFast mode when adaptive concurrency is on', async () => {
    const get = vi.fn().mockRejectedValue(GuildPassError.fromHttpError(429));
    const service = new AccessService({ get } as unknown as HttpClient);

    const items = Array.from({ length: 10 }, (_, i) => makeItem(i));
    await expect(
      service.checkAccessBatch(items, {
        concurrency: 3,
        failFast: true,
        adaptiveConcurrency: true,
      }),
    ).rejects.toThrow();
  });
});
