import { describe, expect, it, vi } from 'vitest';
import { PaginatedResult, paginateAll } from '../src/utils/pagination';

describe('paginateAll', () => {
  it('should fetch all pages until hasMore is false', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({
        items: [1, 2],
        nextCursor: 'cursor-1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [3, 4],
        nextCursor: 'cursor-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [5],
        nextCursor: undefined,
        hasMore: false,
      });

    const results: number[] = [];
    for await (const item of paginateAll(fetchPage)) {
      results.push(item);
    }

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'cursor-1');
    expect(fetchPage).toHaveBeenNthCalledWith(3, 'cursor-2');
  });

  it('should handle empty pages', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const results: number[] = [];
    for await (const item of paginateAll(fetchPage)) {
      results.push(item);
    }

    expect(results).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it('should stop immediately if hasMore is false', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      items: [1],
      nextCursor: 'random',
      hasMore: false,
    });

    const results: number[] = [];
    for await (const item of paginateAll(fetchPage)) {
      results.push(item);
    }

    expect(results).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
