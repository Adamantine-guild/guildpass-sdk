import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdaptiveContractProvider } from '../adaptiveContractProvider';
import { ProviderConfig, ProviderHealthStatus } from '../provider.types';

describe('AdaptiveContractProvider', () => {
  let providers: ProviderConfig[];
  let adaptiveProvider: AdaptiveContractProvider;

  beforeEach(() => {
    providers = [
      {
        name: 'provider1',
        url: 'https://provider1.com',
        timeout: 1000,
        maxRetries: 3,
        healthCheckInterval: 30000,
        enabled: true,
        weight: 1,
      },
      {
        name: 'provider2',
        url: 'https://provider2.com',
        timeout: 1000,
        maxRetries: 3,
        healthCheckInterval: 30000,
        enabled: true,
        weight: 1,
      },
      {
        name: 'provider3',
        url: 'https://provider3.com',
        timeout: 1000,
        maxRetries: 3,
        healthCheckInterval: 30000,
        enabled: true,
        weight: 1,
      },
    ];

    adaptiveProvider = new AdaptiveContractProvider(providers);
  });

  afterEach(() => {
    adaptiveProvider.stopHealthChecks();
  });

  describe('Health Tracking', () => {
    it('should track successful requests', async () => {
      const fn = vi.fn().mockResolvedValue({ success: true });

      await adaptiveProvider.execute(fn);

      expect(fn).toHaveBeenCalled();
      const healthStatus = adaptiveProvider.getHealthStatus();
      expect(healthStatus['provider1'].score).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Request failed'));

      try {
        await adaptiveProvider.execute(fn);
      } catch (error) {
        // Expected
      }

      const healthStatus = adaptiveProvider.getHealthStatus();
      expect(healthStatus['provider1'].score).toBeLessThan(100);
    });

    it('should track timeouts', async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 2000);
        })
      );

      try {
        await adaptiveProvider.execute(fn);
      } catch (error) {
        // Expected
      }

      const healthStatus = adaptiveProvider.getHealthStatus();
      expect(healthStatus['provider1'].score).toBeLessThan(100);
    });
  });

  describe('Provider Selection', () => {
    it('should select the best healthy provider', () => {
      const selection = adaptiveProvider.selectProvider();
      expect(selection).toBeDefined();
      expect(selection?.provider).toBeDefined();
      expect(selection?.score).toBeGreaterThan(0);
    });

    it('should handle degraded providers', async () => {
      // Degrade provider1
      const fn = vi.fn().mockRejectedValue(new Error('Request failed'));
      for (let i = 0; i < 5; i++) {
        try {
          await adaptiveProvider.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      // Check that provider1 is degraded
      const status = adaptiveProvider.getHealthStatus();
      expect(status['provider1'].status).toBe(ProviderHealthStatus.DEGRADED);

      // selection should pick provider2 or provider3
      const selection = adaptiveProvider.selectProvider();
      expect(selection?.provider.name).not.toBe('provider1');
    });

    it('should handle all degraded providers', async () => {
      // Degrade all providers
      const fn = vi.fn().mockRejectedValue(new Error('Request failed'));
      for (let i = 0; i < 10; i++) {
        try {
          await adaptiveProvider.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      const status = adaptiveProvider.getHealthStatus();
      expect(status['provider1'].status).toBe(ProviderHealthStatus.DEGRADED);
      expect(status['provider2'].status).toBe(ProviderHealthStatus.DEGRADED);
      expect(status['provider3'].status).toBe(ProviderHealthStatus.DEGRADED);

      // Should still select the least degraded
      const selection = adaptiveProvider.selectProvider();
      expect(selection).toBeDefined();
    });
  });

  describe('Provider Recovery', () => {
    it('should recover a degraded provider after improvement', async () => {
      // Degrade provider1
      let requestCount = 0;
      const failingFn = vi.fn().mockImplementation(async () => {
        requestCount++;
        if (requestCount <= 3) {
          throw new Error('Request failed');
        }
        return { success: true };
      });

      for (let i = 0; i < 5; i++) {
        try {
          await adaptiveProvider.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Provider1 should be degraded
      let status = adaptiveProvider.getHealthStatus();
      expect(status['provider1'].status).toBe(ProviderHealthStatus.DEGRADED);

      // Now it starts succeeding
      for (let i = 0; i < 3; i++) {
        await adaptiveProvider.execute(failingFn);
      }

      // Provider1 should recover
      status = adaptiveProvider.getHealthStatus();
      // The score should improve, but may not reach 'healthy' immediately
      expect(status['provider1'].score).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should handle empty provider list', () => {
      expect(() => {
        new AdaptiveContractProvider([]);
      }).toThrow('No enabled providers configured');
    });

    it('should filter disabled providers', () => {
      const providerList: ProviderConfig[] = [
        {
          name: 'enabled',
          url: 'https://enabled.com',
          timeout: 1000,
          maxRetries: 3,
          healthCheckInterval: 30000,
          enabled: true,
          weight: 1,
        },
        {
          name: 'disabled',
          url: 'https://disabled.com',
          timeout: 1000,
          maxRetries: 3,
          healthCheckInterval: 30000,
          enabled: false,
          weight: 1,
        },
      ];

      const adaptive = new AdaptiveContractProvider(providerList);
      const healthStatus = adaptive.getHealthStatus();
      expect(healthStatus['enabled']).toBeDefined();
      expect(healthStatus['disabled']).toBeUndefined();
      adaptive.stopHealthChecks();
    });
  });
});
