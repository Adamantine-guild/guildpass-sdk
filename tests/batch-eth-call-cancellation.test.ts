import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const rpcUrl = 'https://rpc.test.com';
const validCall = { to: '0x1234567890123456789012345678901234567890', data: '0xabcdef' };

function jsonRpcSuccess(id: number) {
  return { jsonrpc: '2.0', id, result: '0x0000000000000000000000000000000000000000000000000000000000000001' };
}

describe('Mid-batch cancellation — batchEthCall', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('rejects the whole (unchunked) batch call when aborted mid-flight — all-or-nothing, unlike checkAccessBatch', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(new Response(JSON.stringify([jsonRpcSuccess(1), jsonRpcSuccess(2)]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        }, 200);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const resultPromise = client.contracts.batchEthCall(
      [validCall, validCall],
      rpcUrl,
      { signal: controller.signal },
    );

    setTimeout(() => controller.abort(), 20);

    await expect(resultPromise).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });

    // A single unchunked batch is one HTTP call — confirm it was actually made
    // (i.e. we're testing real in-flight cancellation, not a pre-aborted no-op).
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects the whole chunked/concurrent batch when one chunk is cancelled mid-flight', async () => {
    const client = new GuildPassClient({
      apiUrl: 'https://api.test.com',
      fetch: mockFetch,
    });
    const controller = new AbortController();

    let callCount = 0;
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      callCount++;
      const isFirstChunk = callCount === 1;
      return new Promise((resolve, reject) => {
        const delayMs = isFirstChunk ? 5 : 200;
        const timer = setTimeout(() => {
          resolve(new Response(JSON.stringify([jsonRpcSuccess(1)]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        }, delayMs);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    // 4 calls, maxBatchSize 2 -> 2 chunks, chunkConcurrency 2 -> both chunks
    // start in parallel.
    const resultPromise = client.contracts.batchEthCall(
      [validCall, validCall, validCall, validCall],
      rpcUrl,
      { signal: controller.signal, maxBatchSize: 2, chunk: true, chunkConcurrency: 2 },
    );

    // Let the fast chunk resolve, then abort before the slow chunk completes.
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();

    // Documents current behavior: executeChunksConcurrently's Promise.all
    // rejects entirely when any chunk rejects — the fast chunk's already-
    // resolved result is discarded rather than returned as a partial batch.
    await expect(resultPromise).rejects.toMatchObject({
      code: GuildPassErrorCode.REQUEST_CANCELLED,
    });
  });
});
