/**
 * Tests for the Adaptive Multicall3/JSON-RPC-batch hybrid provider (#237).
 *
 * Acceptance criteria coverage:
 *  1. Per-URL capabilities are detected and cached (no re-probing per request).
 *  2. The optimal available strategy is selected across capability/health mixes.
 *  3. The full fallback chain (Multicall3 -> JSON-RPC batch -> sequential) is
 *     exercised end-to-end, including mid-chain failures forcing further fallback.
 *  4. The per-URL circuit breaker opens on repeated failure and recovers after
 *     the cooldown window.
 *
 * Mocking approach: rather than queue fetch responses by call order (which is
 * fragile against lazy, cached probing), we install a content-aware router
 * that inspects each request and replies based on (a) which URL it targets,
 * (b) whether it is a JSON-RPC batch (array body), and (c) whether it is an
 * aggregate3 call to the Multicall3 address. Per-URL behaviour is configurable
 * so each test declares capability/health per endpoint declaratively.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../src/http/httpClient';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { AdaptiveContractProvider } from '../src/contracts/providers/adaptiveContractProvider';
import {
  MULTICALL3_ADDRESS,
  MULTICALL3_AGGREGATE3_SELECTOR,
} from '../src/contracts/providers/adaptive.types';
import type { EthCallRequest } from '../src/contracts/providers/provider.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.test.com';
const PRIMARY_RPC = 'https://rpc1.test.com';
const FALLBACK_RPC = 'https://rpc2.test.com';

const TOKEN_A = '0x000000000000000000000000000000000000000A';
const TOKEN_B = '0x000000000000000000000000000000000000000B';
const TOKEN_C = '0x000000000000000000000000000000000000000C';

const RESULT_A = '0x' + '11'.repeat(32);
const RESULT_B = '0x' + '22'.repeat(32);
const RESULT_C = '0x' + '33'.repeat(32);

const mockFetch = (): ReturnType<typeof vi.fn> =>
  fetch as unknown as ReturnType<typeof vi.fn>;

const REQS: EthCallRequest[] = [
  { to: TOKEN_A, data: '0xdead' },
  { to: TOKEN_B, data: '0xbeef' },
  { to: TOKEN_C, data: '0xcafe' },
];

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: () => Promise.resolve(payload),
});

const httpError = (status: number) => ({
  ok: false,
  status,
  headers: new Headers(),
  json: () => Promise.resolve({ message: `HTTP ${status}` }),
});

const rpcRevert = () =>
  ok({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } });

// Encode a valid aggregate3 return: (bool success, bytes returnData)[].
const aggregate3Return = (words: string[]): string => {
  const w = (n: number) => n.toString(16).padStart(64, '0');
  const count = words.length;
  const head: string[] = [];
  const tails: string[] = [];
  let offset = count * 32;
  for (const raw of words) {
    const clean = (raw.startsWith('0x') ? raw.slice(2) : raw).padEnd(64, '0');
    const tuple = w(1) + w(0x40) + w(32) + clean; // success, bytes-offset, len, body
    head.push(w(offset));
    tails.push(tuple);
    offset += tuple.length / 2;
  }
  return '0x' + w(0x20) + w(count) + head.join('') + tails.join('');
};

// ---------------------------------------------------------------------------
// Content-aware fetch router
// ---------------------------------------------------------------------------

type Kind = 'batch' | 'multicall3' | 'ethCall';

type UrlBehaviour = {
  batchSupported?: boolean; // reply to a 2+ item array with ordered results
  multicall3?: boolean;     // reply to aggregate3 with a valid return
  // Optional forced outcome per kind: 'fail' (500), 'net' (network), 'revert'.
  fail?: Partial<Record<Kind, 'fail' | 'net' | 'revert'>>;
};

const classify = (init: RequestInit | undefined): { kind: Kind; body: any } => {
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (Array.isArray(body)) return { kind: 'batch', body };
  const to = body?.params?.[0]?.to?.toLowerCase?.() ?? '';
  const data: string = body?.params?.[0]?.data ?? '';
  if (to === MULTICALL3_ADDRESS.toLowerCase() && data.startsWith(MULTICALL3_AGGREGATE3_SELECTOR)) {
    return { kind: 'multicall3', body };
  }
  return { kind: 'ethCall', body };
};

const urlOf = (input: unknown): string => String(input);

const makeRouter = (behaviours: Record<string, UrlBehaviour>) => {
  return (input: unknown, init?: RequestInit) => {
    const url = urlOf(input);
    const key = Object.keys(behaviours).find((k) => url.includes(new URL(k).host)) ?? '';
    const b = behaviours[key] ?? {};
    const { kind, body } = classify(init);

    const forced = b.fail?.[kind];
    if (forced === 'net') return Promise.reject(new TypeError('Failed to fetch'));
    if (forced === 'fail') return Promise.resolve(httpError(500));
    if (forced === 'revert') return Promise.resolve(rpcRevert());

    if (kind === 'batch') {
      if (!b.batchSupported) return Promise.resolve(httpError(400));
      // Ordered per-item results; probe uses a 2-item batch, real path uses 3.
      const items = (body as any[]).map((it, i) => ({
        id: it.id ?? i + 1,
        result: [RESULT_A, RESULT_B, RESULT_C][i] ?? '0x',
      }));
      return Promise.resolve(ok(items));
    }

    if (kind === 'multicall3') {
      if (!b.multicall3) return Promise.resolve(httpError(500));
      return Promise.resolve(ok({ jsonrpc: '2.0', id: 1, result: aggregate3Return([RESULT_A, RESULT_B, RESULT_C]) }));
    }

    // Plain eth_call: map target -> canned result (used by sequential + probe).
    const to = body?.params?.[0]?.to?.toLowerCase?.() ?? '';
    const map: Record<string, string> = {
      [TOKEN_A.toLowerCase()]: RESULT_A,
      [TOKEN_B.toLowerCase()]: RESULT_B,
      [TOKEN_C.toLowerCase()]: RESULT_C,
    };
    return Promise.resolve(ok({ jsonrpc: '2.0', id: 1, result: map[to] ?? '0x' }));
  };
};

// ---------------------------------------------------------------------------

describe('AdaptiveContractProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC1: capability probing is cached, not repeated per request
  // -------------------------------------------------------------------------

  describe('capability probing (AC1)', () => {
    it('probes a URL once and caches the result across calls', async () => {
      mockFetch().mockImplementation(
        makeRouter({ [PRIMARY_RPC]: { batchSupported: true, multicall3: true } }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const first = await provider.batchEthCall(REQS);
      const afterFirst = mockFetch().mock.calls.length;
      const second = await provider.batchEthCall(REQS);
      const afterSecond = mockFetch().mock.calls.length;

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(3);
      // First call: 2 probe fetches (batch + multicall3) + 1 aggregate3 = 3.
      expect(afterFirst).toBe(3);
      // Second call adds exactly one fetch (aggregate3), proving no re-probe.
      expect(afterSecond - afterFirst).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // AC2: optimal strategy selection across capability/health combinations
  // -------------------------------------------------------------------------

  describe('strategy selection (AC2)', () => {
    it('uses Multicall3 when available and the batch is large enough', async () => {
      mockFetch().mockImplementation(
        makeRouter({ [PRIMARY_RPC]: { batchSupported: true, multicall3: true } }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const results = await provider.batchEthCall(REQS);

      expect(results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
      const kinds = mockFetch().mock.calls.map((c) => classify(c[1] as RequestInit).kind);
      expect(kinds).toContain('multicall3');
    });

    it('uses JSON-RPC batch when Multicall3 is absent but batching works', async () => {
      mockFetch().mockImplementation(
        makeRouter({ [PRIMARY_RPC]: { batchSupported: true, multicall3: false } }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const results = await provider.batchEthCall(REQS);

      expect(results.map((r) => r.result)).toEqual([RESULT_A, RESULT_B, RESULT_C]);
      // The final (data) fetch must be a JSON-RPC batch. Earlier fetches include
      // the one-time Multicall3 availability probe, which is expected even when
      // Multicall3 is absent, so we assert on the real data call specifically.
      const calls = mockFetch().mock.calls;
      const lastKind = classify(calls[calls.length - 1][1] as RequestInit).kind;
      expect(lastKind).toBe('batch');
    });

    it('falls to sequential when neither Multicall3 nor batch is supported', async () => {
      mockFetch().mockImplementation(
        makeRouter({ [PRIMARY_RPC]: { batchSupported: false, multicall3: false } }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const results = await provider.batchEthCall(REQS);

      expect(results.map((r) => r.result)).toEqual([RESULT_A, RESULT_B, RESULT_C]);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: full fallback chain, including mid-chain failure forcing further fallback
  // -------------------------------------------------------------------------

  describe('fallback chain (AC3)', () => {
    it('degrades Multicall3 -> JSON-RPC batch -> sequential on the same URL', async () => {
      // Multicall3 and batch both fail at call time; sequential eth_calls work.
      mockFetch().mockImplementation(
        makeRouter({
          [PRIMARY_RPC]: {
            batchSupported: true,
            multicall3: true,
            fail: { multicall3: 'fail', batch: 'fail' },
          },
        }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const results = await provider.batchEthCall(REQS);

      expect(results.map((r) => r.result)).toEqual([RESULT_A, RESULT_B, RESULT_C]);
    });

    it('fails over to the next URL when the first URL is exhausted', async () => {
      mockFetch().mockImplementation(
        makeRouter({
          // URL1: batch supported at probe, but every real call type fails.
          [PRIMARY_RPC]: {
            batchSupported: true,
            multicall3: false,
            fail: { batch: 'net', ethCall: 'net' },
          },
          // URL2: healthy, batch works.
          [FALLBACK_RPC]: { batchSupported: true, multicall3: false },
        }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), [
        PRIMARY_RPC,
        FALLBACK_RPC,
      ]);

      const results = await provider.batchEthCall(REQS);

      expect(results.map((r) => r.result)).toEqual([RESULT_A, RESULT_B, RESULT_C]);
      const urls = mockFetch().mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('rpc1'))).toBe(true);
      expect(urls.some((u) => u.includes('rpc2'))).toBe(true);
    });

    it('surfaces contract-level (non-transient) errors immediately', async () => {
      mockFetch().mockImplementation(
        makeRouter({
          [PRIMARY_RPC]: {
            batchSupported: false,
            multicall3: false,
            fail: { ethCall: 'revert' },
          },
        }),
      );
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC);

      const single: EthCallRequest[] = [{ to: TOKEN_A, data: '0xdead' }];

      // Contract-level reverts are reported per item (the batch contract says
      // individual failures must NOT reject the whole batch), and no failover
      // is attempted for a deterministic revert.
      const results = await provider.batchEthCall(single);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].error).toContain('reverted');
      // Exactly one fetch: a single-item batch skips probing (it cannot
      // benefit from Multicall3/batching) and a revert is not retried.
      expect(mockFetch()).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // AC4: circuit breaker opens on repeated failure, recovers after cooldown
  // -------------------------------------------------------------------------

  describe('circuit breaker (AC4)', () => {
    it('opens the circuit after the failure threshold and skips the URL', () => {
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC, {
        health: { failureThreshold: 3, cooldownMs: 1000 },
      });
      const tracker = provider.healthTracker;

      expect(tracker.isHealthy(PRIMARY_RPC, 0)).toBe(true);
      tracker.recordFailure(PRIMARY_RPC, 0);
      tracker.recordFailure(PRIMARY_RPC, 0);
      expect(tracker.isHealthy(PRIMARY_RPC, 0)).toBe(true);
      tracker.recordFailure(PRIMARY_RPC, 0);
      expect(tracker.isHealthy(PRIMARY_RPC, 0)).toBe(false);
    });

    it('recovers (half-open trial) once the cooldown elapses', () => {
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC, {
        health: { failureThreshold: 1, cooldownMs: 1000 },
      });
      const tracker = provider.healthTracker;

      tracker.recordFailure(PRIMARY_RPC, 0);
      expect(tracker.isHealthy(PRIMARY_RPC, 500)).toBe(false);
      expect(tracker.isHealthy(PRIMARY_RPC, 1000)).toBe(true);
      tracker.recordSuccess(PRIMARY_RPC, 42);
      expect(tracker.isHealthy(PRIMARY_RPC, 1000)).toBe(true);
    });

    it('tracks latency via an exponential moving average', () => {
      const provider = new AdaptiveContractProvider(new HttpClient(BASE_URL), PRIMARY_RPC, {
        health: { latencyEmaAlpha: 0.5 },
      });
      const tracker = provider.healthTracker;

      tracker.recordSuccess(PRIMARY_RPC, 100);
      expect(tracker.latencyOf(PRIMARY_RPC)).toBe(100);
      tracker.recordSuccess(PRIMARY_RPC, 200);
      expect(tracker.latencyOf(PRIMARY_RPC)).toBe(150);
    });
  });
});
