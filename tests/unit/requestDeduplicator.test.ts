import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RequestDeduplicator,
  RequestDeduplicatorOptions,
  AsyncProducer,
  CapacityExceededError,
} from '../../src/utils/requestDeduplicator.js';

describe('RequestDeduplicator', () => {
  describe('constructor validation', () => {
    it('should accept default options', () => {
      const deduplicator = new RequestDeduplicator<string>();
      expect(deduplicator.getInFlightCount()).toBe(0);
    });

    it('should accept valid maxInFlight', () => {
      const deduplicator = new RequestDeduplicator<string>({ maxInFlight: 50 });
      expect(deduplicator.getInFlightCount()).toBe(0);
    });

    it('should throw for non-positive maxInFlight', () => {
      expect(() => new RequestDeduplicator<string>({ maxInFlight: 0 })).toThrow('maxInFlight must be a positive integer');
      expect(() => new RequestDeduplicator<string>({ maxInFlight: -5 })).toThrow('maxInFlight must be a positive integer');
    });

    it('should throw for non-integer maxInFlight', () => {
      expect(() => new RequestDeduplicator<string>({ maxInFlight: 1.5 })).toThrow('maxInFlight must be a positive integer');
    });

    it('should accept valid retentionMs', () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 1000 });
      expect(deduplicator.getRetainedCount()).toBe(0);
    });

    it('should throw for negative retentionMs', () => {
      expect(() => new RequestDeduplicator<string>({ retentionMs: -1 })).toThrow('retentionMs must be a non-negative integer');
    });

    it('should throw for non-integer retentionMs', () => {
      expect(() => new RequestDeduplicator<string>({ retentionMs: 1.5 })).toThrow('retentionMs must be a non-negative integer');
    });
  });

  describe('exactly-once execution', () => {
    it('should execute producer exactly once for concurrent calls with same key', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      const [result1, result2] = await Promise.all([
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
      ]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should execute producer exactly once for three concurrent calls', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      const results = await Promise.all([
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
      ]);

      expect(results).toEqual(['result', 'result', 'result']);
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should execute producer for different keys independently', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer1 = vi.fn().mockResolvedValue('result1');
      const producer2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        deduplicator.execute('key1', producer1),
        deduplicator.execute('key2', producer2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(producer1).toHaveBeenCalledTimes(1);
      expect(producer2).toHaveBeenCalledTimes(1);
    });

    it('should allow retry after completion with same key', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      const result1 = await deduplicator.execute('key1', producer);
      expect(result1).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);

      const result2 = await deduplicator.execute('key1', producer);
      expect(result2).toBe('result');
      expect(producer).toHaveBeenCalledTimes(2); // Executed again
    });
  });

  describe('success handling', () => {
    it('should return successful result to all callers', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('success');

      const [result1, result2] = await Promise.all([
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
      ]);

      expect(result1).toBe('success');
      expect(result2).toBe('success');
    });

    it('should remove entry after success by default', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      await deduplicator.execute('key1', producer);
      expect(deduplicator.getInFlightCount()).toBe(0);

      // Should execute again on next call
      await deduplicator.execute('key1', producer);
      expect(producer).toHaveBeenCalledTimes(2);
    });

    it('should retain result for configured retention period', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 100 });
      const producer = vi.fn().mockResolvedValue('result');

      const result1 = await deduplicator.execute('key1', producer);
      expect(result1).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);

      // Should return retained result without executing producer
      const result2 = await deduplicator.execute('key1', producer);
      expect(result2).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should expire retained result after retention period', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 10 });
      const producer = vi.fn().mockResolvedValue('result');

      await deduplicator.execute('key1', producer);
      expect(producer).toHaveBeenCalledTimes(1);

      // Wait for retention to expire
      await new Promise((resolve) => setTimeout(resolve, 15));

      // Should execute producer again
      await deduplicator.execute('key1', producer);
      expect(producer).toHaveBeenCalledTimes(2);
    });
  });

  describe('failure handling', () => {
    it('should propagate failure to all callers', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const error = new Error('producer failed');
      const producer = vi.fn().mockRejectedValue(error);

      await expect(
        Promise.all([
          deduplicator.execute('key1', producer),
          deduplicator.execute('key1', producer),
        ])
      ).rejects.toThrow('producer failed');

      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should remove entry after failure', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockRejectedValue(new Error('failed'));

      await expect(deduplicator.execute('key1', producer)).rejects.toThrow('failed');
      expect(deduplicator.getInFlightCount()).toBe(0);

      // Should allow retry after failure
      producer.mockResolvedValue('success');
      const result = await deduplicator.execute('key1', producer);
      expect(result).toBe('success');
      expect(producer).toHaveBeenCalledTimes(2);
    });

    it('should not retain failed results', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 100 });
      const producer = vi.fn().mockRejectedValue(new Error('failed'));

      await expect(deduplicator.execute('key1', producer)).rejects.toThrow('failed');
      expect(deduplicator.getRetainedCount()).toBe(0);
    });
  });

  describe('capacity limits', () => {
    it('should enforce maxInFlight capacity', async () => {
      const deduplicator = new RequestDeduplicator<string>({ maxInFlight: 2 });
      const producer1 = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('result1'), 100)));
      const producer2 = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('result2'), 100)));
      const producer3 = vi.fn().mockResolvedValue('result3');

      // Start two in-flight requests
      const promise1 = deduplicator.execute('key1', producer1);
      const promise2 = deduplicator.execute('key2', producer2);

      expect(deduplicator.getInFlightCount()).toBe(2);

      // Third request should exceed capacity
      await expect(deduplicator.execute('key3', producer3)).rejects.toThrow(CapacityExceededError);

      // Clean up
      await Promise.all([promise1, promise2]);
    });

    it('should allow new request after completion', async () => {
      const deduplicator = new RequestDeduplicator<string>({ maxInFlight: 1 });
      const producer = vi.fn().mockResolvedValue('result');

      await deduplicator.execute('key1', producer);
      expect(deduplicator.getInFlightCount()).toBe(0);

      // Should allow new request after completion
      await deduplicator.execute('key2', producer);
      expect(producer).toHaveBeenCalledTimes(2);
    });

    it('should allow new request after failure', async () => {
      const deduplicator = new RequestDeduplicator<string>({ maxInFlight: 1 });
      const producer = vi.fn().mockRejectedValue(new Error('failed'));

      await expect(deduplicator.execute('key1', producer)).rejects.toThrow('failed');
      expect(deduplicator.getInFlightCount()).toBe(0);

      // Should allow new request after failure
      producer.mockResolvedValue('success');
      await deduplicator.execute('key2', producer);
      expect(producer).toHaveBeenCalledTimes(2);
    });
  });

  describe('diagnostics', () => {
    it('should report in-flight count accurately', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('result'), 100)));

      expect(deduplicator.getInFlightCount()).toBe(0);

      const promise1 = deduplicator.execute('key1', producer);
      expect(deduplicator.getInFlightCount()).toBe(1);

      const promise2 = deduplicator.execute('key2', producer);
      expect(deduplicator.getInFlightCount()).toBe(2);

      await Promise.all([promise1, promise2]);
      expect(deduplicator.getInFlightCount()).toBe(0);
    });

    it('should report retained count accurately', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 1000 });
      const producer = vi.fn().mockResolvedValue('result');

      expect(deduplicator.getRetainedCount()).toBe(0);

      await deduplicator.execute('key1', producer);
      expect(deduplicator.getRetainedCount()).toBe(1);

      await deduplicator.execute('key2', producer);
      expect(deduplicator.getRetainedCount()).toBe(2);
    });

    it('should clean up expired entries when reporting retained count', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 10 });
      const producer = vi.fn().mockResolvedValue('result');

      await deduplicator.execute('key1', producer);
      await deduplicator.execute('key2', producer);
      expect(deduplicator.getRetainedCount()).toBe(2);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 15));

      // getRetainedCount should clean up expired entries
      expect(deduplicator.getRetainedCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all in-flight requests', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('result'), 100)));

      const promise1 = deduplicator.execute('key1', producer);
      const promise2 = deduplicator.execute('key2', producer);

      expect(deduplicator.getInFlightCount()).toBe(2);

      deduplicator.clear();

      expect(deduplicator.getInFlightCount()).toBe(0);

      // Promises should still resolve
      await Promise.all([promise1, promise2]);
    });

    it('should clear all retained results', async () => {
      const deduplicator = new RequestDeduplicator<string>({ retentionMs: 1000 });
      const producer = vi.fn().mockResolvedValue('result');

      await deduplicator.execute('key1', producer);
      await deduplicator.execute('key2', producer);

      expect(deduplicator.getRetainedCount()).toBe(2);

      deduplicator.clear();

      expect(deduplicator.getRetainedCount()).toBe(0);
    });
  });

  describe('controlled promise execution', () => {
    it('should prove exactly-once execution with controlled promises', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      let executionCount = 0;

      const createControlledProducer = (): AsyncProducer<string> => {
        return () => {
          executionCount++;
          return new Promise((resolve) => {
            setTimeout(() => resolve(`execution-${executionCount}`), 10);
          });
        };
      };

      const producer = createControlledProducer();

      const [result1, result2, result3] = await Promise.all([
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
        deduplicator.execute('key1', producer),
      ]);

      expect(executionCount).toBe(1);
      expect(result1).toBe('execution-1');
      expect(result2).toBe('execution-1');
      expect(result3).toBe('execution-1');
    });

    it('should handle sequential calls with controlled promises', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      let executionCount = 0;

      const createControlledProducer = (): AsyncProducer<string> => {
        return () => {
          executionCount++;
          return Promise.resolve(`execution-${executionCount}`);
        };
      };

      const producer = createControlledProducer();

      const result1 = await deduplicator.execute('key1', producer);
      expect(result1).toBe('execution-1');
      expect(executionCount).toBe(1);

      const result2 = await deduplicator.execute('key1', producer);
      expect(result2).toBe('execution-2');
      expect(executionCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string key', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      const result = await deduplicator.execute('', producer);
      expect(result).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should handle special characters in key', async () => {
      const deduplicator = new RequestDeduplicator<string>();
      const producer = vi.fn().mockResolvedValue('result');

      const result = await deduplicator.execute('key:with/special-chars_123', producer);
      expect(result).toBe('result');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should handle producer that returns undefined', async () => {
      const deduplicator = new RequestDeduplicator<undefined>();
      const producer = vi.fn().mockResolvedValue(undefined);

      const result = await deduplicator.execute('key1', producer);
      expect(result).toBeUndefined();
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should handle producer that returns null', async () => {
      const deduplicator = new RequestDeduplicator<null>();
      const producer = vi.fn().mockResolvedValue(null);

      const result = await deduplicator.execute('key1', producer);
      expect(result).toBeNull();
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('should handle producer that returns complex objects', async () => {
      const deduplicator = new RequestDeduplicator<{ id: number; data: string }>();
      const producer = vi.fn().mockResolvedValue({ id: 123, data: 'test' });

      const result = await deduplicator.execute('key1', producer);
      expect(result).toEqual({ id: 123, data: 'test' });
      expect(producer).toHaveBeenCalledTimes(1);
    });
  });
});
