import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Page,
  PageRequest,
  validateLimit,
  validateCursor,
  createPageRequest,
  paginate,
  collectAll,
  createPaginatedApi,
  RepeatedCursorError,
  InvalidLimitError,
  InvalidCursorError,
} from '../../src/utils/pagination.js';

describe('Pagination Utils', () => {
  describe('validateLimit', () => {
    it('should return default limit when undefined', () => {
      expect(validateLimit()).toBe(20);
    });

    it('should return the limit when valid', () => {
      expect(validateLimit(10)).toBe(10);
      expect(validateLimit(1)).toBe(1);
      expect(validateLimit(100)).toBe(100);
    });

    it('should throw InvalidLimitError when limit is below minimum', () => {
      expect(() => validateLimit(0)).toThrow(InvalidLimitError);
      expect(() => validateLimit(-5)).toThrow(InvalidLimitError);
    });

    it('should throw InvalidLimitError when limit is above maximum', () => {
      expect(() => validateLimit(101)).toThrow(InvalidLimitError);
      expect(() => validateLimit(1000)).toThrow(InvalidLimitError);
    });
  });

  describe('validateCursor', () => {
    it('should return null for undefined or null', () => {
      expect(validateCursor(undefined)).toBeNull();
      expect(validateCursor(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateCursor('')).toBeNull();
      expect(validateCursor('   ')).toBeNull();
    });

    it('should return trimmed cursor for valid string', () => {
      expect(validateCursor('abc123')).toBe('abc123');
      expect(validateCursor('  abc123  ')).toBe('abc123');
    });

    it('should throw InvalidCursorError for non-string values', () => {
      expect(() => validateCursor(123 as any)).toThrow(InvalidCursorError);
      expect(() => validateCursor({} as any)).toThrow(InvalidCursorError);
    });

    it('should throw InvalidCursorError for cursor with control characters', () => {
      expect(() => validateCursor('abc\x00def')).toThrow(InvalidCursorError);
      expect(() => validateCursor('abc\n')).toThrow(InvalidCursorError);
    });
  });

  describe('createPageRequest', () => {
    it('should create a validated page request', () => {
      const result = createPageRequest({ cursor: 'abc123', limit: 50 });
      expect(result).toEqual({ cursor: 'abc123', limit: 50 });
    });

    it('should use defaults for missing values', () => {
      const result = createPageRequest({});
      expect(result).toEqual({ cursor: null, limit: 20 });
    });

    it('should validate cursor and limit', () => {
      expect(() => createPageRequest({ limit: 200 })).toThrow(InvalidLimitError);
      expect(() => createPageRequest({ cursor: '\x00' })).toThrow(InvalidCursorError);
    });
  });

  describe('paginate', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('should handle a single page', async () => {
      const items = [{ id: 1 }, { id: 2 }];
      mockFetch.mockResolvedValueOnce({ items, nextCursor: null });

      const results: any[] = [];
      for await (const item of paginate(mockFetch)) {
        results.push(item);
      }

      expect(results).toEqual(items);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith({ cursor: null, limit: 20 });
    });

    it('should handle multiple pages', async () => {
      mockFetch
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: null });

      const results: any[] = [];
      for await (const item of paginate(mockFetch)) {
        results.push(item);
      }

      expect(results).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith({ cursor: null, limit: 20 });
      expect(mockFetch).toHaveBeenCalledWith({ cursor: 'cursor1', limit: 20 });
    });

    it('should handle empty pages', async () => {
      mockFetch.mockResolvedValueOnce({ items: [], nextCursor: null });

      const results: any[] = [];
      for await (const item of paginate(mockFetch)) {
        results.push(item);
      }

      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle empty page with nextCursor', async () => {
      mockFetch
        .mockResolvedValueOnce({ items: [], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: null });

      const results: any[] = [];
      for await (const item of paginate(mockFetch)) {
        results.push(item);
      }

      expect(results).toEqual([{ id: 1 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should detect repeated cursors', async () => {
      mockFetch
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: 'cursor1' });

      const iterator = paginate(mockFetch);
      const results: any[] = [];
      
      await expect(async () => {
        for await (const item of iterator) {
          results.push(item);
        }
      }).rejects.toThrow(RepeatedCursorError);
      
      expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should support AbortSignal cancellation', async () => {
      const controller = new AbortController();
      const signal = controller.signal;

      mockFetch
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: 'cursor2' });

      const iterator = paginate(mockFetch, { signal, maxPages: 10 });
      
      // Cancel after first page
      let count = 0;
      await expect(async () => {
        for await (const item of iterator) {
          count++;
          if (count === 1) {
            controller.abort();
          }
        }
      }).rejects.toThrow('Pagination cancelled');
      
      expect(count).toBe(1);
    });

    it('should respect maxPages limit', async () => {
      mockFetch
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: 'cursor2' })
        .mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: null });

      const iterator = paginate(mockFetch, { maxPages: 2 });
      
      const results: any[] = [];
      await expect(async () => {
        for await (const item of iterator) {
          results.push(item);
        }
      }).rejects.toThrow('Maximum page limit (2) reached');
      
      expect(results).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should preserve page and item ordering', async () => {
      mockFetch
        .mockResolvedValueOnce({ items: [{ id: 1 }, { id: 2 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 3 }, { id: 4 }], nextCursor: null });

      const results: any[] = [];
      for await (const item of paginate(mockFetch)) {
        results.push(item);
      }

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });
  });

  describe('collectAll', () => {
    it('should collect all items into an array', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'cursor1' })
        .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: null });

      const results = await collectAll(mockFetch);
      
      expect(results).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ items: [], nextCursor: null });

      const results = await collectAll(mockFetch);
      
      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createPaginatedApi', () => {
    it('should wrap an API method', async () => {
      const mockApi = vi.fn()
        .mockResolvedValue({ items: [{ id: 1 }], nextCursor: null });

      const api = createPaginatedApi(mockApi);

      // Test page method
      const page = await api.page({ limit: 10 });
      expect(page).toEqual({ items: [{ id: 1 }], nextCursor: null });
      expect(mockApi).toHaveBeenCalledWith({ limit: 10 });

      // Test collect method
      mockApi.mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: null });
      const all = await api.collect();
      expect(all).toEqual([{ id: 2 }]);

      // Test all method (iterator)
      mockApi.mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: null });
      const items: any[] = [];
      for await (const item of api.all()) {
        items.push(item);
      }
      expect(items).toEqual([{ id: 3 }]);
    });
  });
});
