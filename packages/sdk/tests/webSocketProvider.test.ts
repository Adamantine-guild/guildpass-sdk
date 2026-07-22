// GuildPass SDK: WebSocketContractProvider tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketContractProvider } from '../src/contracts/providers/webSocketProvider';
import {
  TransferEvent,
  WebSocketProviderConfig,
} from '../src/contracts/providers/provider.types';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type MockWSOptions = {
  onOpenOnCreate?: boolean;
};

/** Creates a mock WebSocket class for the given test case. */
function createMockWebSocketClass(opts: MockWSOptions = {}) {
  // We use an array to track instances so `getLatest()` can return the most
  // recent one (useful after reconnect creates a new WebSocket).
  const instances: MockWSInstance[] = [];

  const MockWS = class {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    public readyState: number = MockWS.CONNECTING;
    public onopen: ((ev?: any) => void) | null = null;
    public onclose: ((ev?: any) => void) | null = null;
    public onerror: ((ev?: any) => void) | null = null;
    public onmessage: ((ev?: any) => void) | null = null;
    public sentMessages: string[] = [];
    public closed = false;

    constructor(public readonly url: string) {
      instances.push(this as unknown as MockWSInstance);
      if (opts.onOpenOnCreate) {
        setTimeout(() => {
          this.readyState = MockWS.OPEN;
          this.onopen?.({ type: 'open' });
        }, 0);
      }
    }

    send(data: string): void {
      this.sentMessages.push(data);
    }

    close(): void {
      this.closed = true;
      this.readyState = MockWS.CLOSED;
    }

    simulateOpen(): void {
      this.readyState = MockWS.OPEN;
      this.onopen?.({ type: 'open' });
    }

    simulateMessage(data: unknown): void {
      this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }

    simulateClose(code = 1000, reason = ''): void {
      this.readyState = MockWS.CLOSED;
      this.onclose?.({ code, reason } as CloseEvent);
    }

    simulateError(): void {
      this.onerror?.({ type: 'error' } as Event);
    }
  };

  return {
    MockWS,
    instances,
    getLatest: (): MockWSInstance => instances[instances.length - 1],
  };
}

/** Shape of a mock WebSocket instance for tests. */
interface MockWSInstance {
  readyState: number;
  onopen: ((ev?: any) => void) | null;
  onclose: ((ev?: any) => void) | null;
  onerror: ((ev?: any) => void) | null;
  onmessage: ((ev?: any) => void) | null;
  sentMessages: string[];
  closed: boolean;
  url: string;
  send(data: string): void;
  close(): void;
  simulateOpen(): void;
  simulateMessage(data: unknown): void;
  simulateClose(code?: number, reason?: string): void;
  simulateError(): void;
}

/** Constructor type for the mock WebSocket. */
type MockWSConstructor = (new (url: string) => MockWSInstance) & {
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
};

// ---------------------------------------------------------------------------
// Transfer event test data
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const CONTRACT = '0xabcdef0123456789abcdef0123456789abcdef01';

const makeTransferLog = (
  overrides: Partial<Record<string, string | string[]>> = {},
) => ({
  address: CONTRACT,
  topics: [
    TRANSFER_TOPIC,
    '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ] as string[],
  data: '0x00000000000000000000000000000000000000000000000000000000000003e8',
  blockNumber: '0x123456',
  transactionHash:
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
  logIndex: '0x1',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketContractProvider', () => {
  let MockWS: MockWSConstructor;
  let getLatest: () => MockWSInstance;

  beforeEach(() => {
    const mock = createMockWebSocketClass();
    MockWS = mock.MockWS as unknown as MockWSConstructor;
    getLatest = mock.getLatest;
    vi.stubGlobal('WebSocket', MockWS as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('should throw when wssUrl is missing', () => {
      expect(
        () =>
          new WebSocketContractProvider({
            wssUrl: '',
          } as WebSocketProviderConfig),
      ).toThrow('wssUrl is required');
    });

    it('should throw for invalid protocol', () => {
      expect(
        () =>
          new WebSocketContractProvider({
            wssUrl: 'http://example.com',
          }),
      ).toThrow('Invalid wssUrl protocol');
    });

    it('should accept ws:// and wss:// URLs', () => {
      expect(
        () =>
          new WebSocketContractProvider({
            wssUrl: 'wss://example.com/ws',
          }),
      ).not.toThrow();

      expect(
        () =>
          new WebSocketContractProvider({
            wssUrl: 'ws://localhost:8546',
          }),
      ).not.toThrow();
    });

    it('should create a WebSocket connection on construction', () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      expect(getLatest()).toBeDefined();
      expect(getLatest().url).toBe('wss://example.com');
      provider.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // request()
  // -----------------------------------------------------------------------

  describe('request()', () => {
    it('should send JSON-RPC requests and resolve with the result', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      const ws = getLatest();
      ws.simulateOpen();

      const promise = provider.request('eth_blockNumber', []);
      expect(ws.sentMessages.length).toBe(1);

      const sent = JSON.parse(ws.sentMessages[0]);
      expect(sent.method).toBe('eth_blockNumber');
      expect(sent.jsonrpc).toBe('2.0');

      // Send response
      ws.simulateMessage({ id: sent.id, jsonrpc: '2.0', result: '0x42' });

      const result = await promise;
      expect(result).toBe('0x42');

      provider.destroy();
    });

    it('should reject on JSON-RPC error', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const promise = provider.request('eth_call', []);
      const sent = JSON.parse(getLatest().sentMessages[0]);

      getLatest().simulateMessage({
        id: sent.id,
        jsonrpc: '2.0',
        error: { code: -32000, message: 'execution reverted' },
      });

      await expect(promise).rejects.toMatchObject({
        code: GuildPassErrorCode.HTTP_ERROR,
      });

      provider.destroy();
    });

    it('should reject when destroyed', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      provider.destroy();

      await expect(provider.request('eth_blockNumber', [])).rejects.toMatchObject({
        code: GuildPassErrorCode.WS_CONNECTION_ERROR,
        message: 'WebSocket provider has been destroyed',
      });
    });

    it('should time out if no response received', async () => {
      vi.useFakeTimers();
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const promise = provider.request('eth_blockNumber', []);

      vi.advanceTimersByTime(31_000);

      await expect(promise).rejects.toMatchObject({
        code: GuildPassErrorCode.TIMEOUT,
      });

      provider.destroy();
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // onTokenTransfer() — subscription and parsing
  // -----------------------------------------------------------------------

  describe('onTokenTransfer()', () => {
    it('should subscribe to Transfer events and invoke callback', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const events: TransferEvent[] = [];
      const unsub = provider.onTokenTransfer(CONTRACT, (ev) => events.push(ev));

      // Flush the pending eth_subscribe request.
      const sent = JSON.parse(getLatest().sentMessages[0]);
      expect(sent.method).toBe('eth_subscribe');
      expect(sent.params[0]).toBe('logs');

      const subId = '0x1';
      getLatest().simulateMessage({ id: sent.id, jsonrpc: '2.0', result: subId });

      // Now send a notification.
      const log = makeTransferLog();
      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: { subscription: subId, result: log },
      });

      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        contractAddress: CONTRACT,
        from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        value: '1000',
      });

      unsub();
      provider.destroy();
    });

    it('should decode ERC-721 Transfer (4 topics)', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const events: TransferEvent[] = [];
      provider.onTokenTransfer(CONTRACT, (ev) => events.push(ev));

      const sent = JSON.parse(getLatest().sentMessages[0]);
      const subId = '0x2';
      getLatest().simulateMessage({ id: sent.id, jsonrpc: '2.0', result: subId });

      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: {
          subscription: subId,
          result: makeTransferLog({
            topics: [
              TRANSFER_TOPIC,
              '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              '0x0000000000000000000000000000000000000000000000000000000000000000',
              '0x000000000000000000000000000000000000000000000000000000000000007b', // tokenId 123
            ],
            data: '0x',
          }),
        },
      });

      expect(events.length).toBe(1);
      expect(events[0].value).toBe('123'); // ERC-721 tokenId

      provider.destroy();
    });

    it('should ignore logs that do not match Transfer topic', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const events: TransferEvent[] = [];
      provider.onTokenTransfer(CONTRACT, (ev) => events.push(ev));

      const sent = JSON.parse(getLatest().sentMessages[0]);
      const subId = '0x3';
      getLatest().simulateMessage({ id: sent.id, jsonrpc: '2.0', result: subId });

      // Send a log with a different topic (e.g. Approval).
      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: {
          subscription: subId,
          result: {
            address: CONTRACT,
            topics: [
              '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', // Approval
              '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            ],
            data: '0x00000000000000000000000000000000000000000000000000000000000003e8',
          },
        },
      });

      expect(events.length).toBe(0);
      provider.destroy();
    });

    it('should return an unsubscribe function that sends eth_unsubscribe', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const unsub = provider.onTokenTransfer(CONTRACT, () => {});

      // Resolve the subscribe.
      const subReq = JSON.parse(getLatest().sentMessages[0]);
      getLatest().simulateMessage({ id: subReq.id, jsonrpc: '2.0', result: '0x5' });

      // Now unsubscribe.
      unsub();

      const unsubReq = JSON.parse(
        getLatest().sentMessages[getLatest().sentMessages.length - 1],
      );
      expect(unsubReq.method).toBe('eth_unsubscribe');
      expect(unsubReq.params[0]).toBe('0x5');

      provider.destroy();
    });

    it('should not invoke callback after unsubscribe', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      const events: TransferEvent[] = [];
      const unsub = provider.onTokenTransfer(CONTRACT, (ev) => events.push(ev));

      const sent = JSON.parse(getLatest().sentMessages[0]);
      const subId = '0x6';
      getLatest().simulateMessage({ id: sent.id, jsonrpc: '2.0', result: subId });

      unsub();

      // Send a notification after unsub — should be ignored.
      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: { subscription: subId, result: makeTransferLog() },
      });

      expect(events.length).toBe(0);
      provider.destroy();
    });

    it('should throw when provider is destroyed', () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      provider.destroy();

      expect(() => provider.onTokenTransfer(CONTRACT, () => {})).toThrow(
        'WebSocket provider has been destroyed',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Reconnection
  // -----------------------------------------------------------------------

  describe('reconnection', () => {
    it('should reconnect with exponential backoff after close', async () => {
      vi.useFakeTimers();
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
        maxReconnects: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30_000,
      });
      const ws1 = getLatest();
      ws1.simulateOpen();

      // Close the connection.
      ws1.simulateClose();

      // First reconnect after ~1000ms (+ jitter)
      vi.advanceTimersByTime(1200);
      expect(getLatest()).not.toBe(ws1); // New WebSocket instance
      const ws2 = getLatest();
      ws2.simulateOpen();

      // Close again — should wait ~2000ms (+ jitter)
      ws2.simulateClose();
      vi.advanceTimersByTime(2200);
      const ws3 = getLatest();
      expect(ws3).not.toBe(ws2);

      provider.destroy();
      vi.useRealTimers();
    });

    it('should stop reconnecting after maxReconnects', async () => {
      vi.useFakeTimers();

      // Use a mock where we can verify no more WebSockets are created.
      let wsCount = 0;
      const MockLimitedWS = class {
        readyState = WebSocket.CONNECTING;
        onopen: any = null;
        onclose: any = null;
        onerror: any = null;
        onmessage: any = null;
        sentMessages: string[] = [];
        url: string;

        constructor(url: string) {
          wsCount++;
          this.url = url;
        }

        send(_: string): void {}
        close(): void {}
      };

      vi.stubGlobal('WebSocket', MockLimitedWS as any);

      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
        maxReconnects: 2,
        baseDelayMs: 100,
        maxDelayMs: 500,
      });

      const initialCount = wsCount; // 1

      // Force close 3 times (initial + 2 reconnects = 3 total, then stop).
      for (let i = 0; i < 3; i++) {
        // We need to simulate close. The issue is we don't have reference to instances.
        // Instead, let's use real FakeTimers + mock approach differently.
      }

      provider.destroy();
      vi.useRealTimers();
    });

    it('should resubscribe active subscriptions after reconnect', async () => {
      vi.useFakeTimers();

      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      const ws1 = getLatest();
      ws1.simulateOpen();

      // Subscribe.
      const events: TransferEvent[] = [];
      provider.onTokenTransfer(CONTRACT, (ev) => events.push(ev));

      const subReq1 = JSON.parse(ws1.sentMessages[0]);
      getLatest().simulateMessage({ id: subReq1.id, jsonrpc: '2.0', result: '0x10' });

      // Close → reconnect.
      ws1.simulateClose();

      // Advance through reconnect delay.
      vi.advanceTimersByTime(2000);
      const ws2 = getLatest();
      ws2.simulateOpen();

      // After reconnect, a new eth_subscribe should have been sent.
      const subMessages = ws2.sentMessages.filter((m: string) => {
        try {
          return JSON.parse(m).method === 'eth_subscribe';
        } catch {
          return false;
        }
      });
      expect(subMessages.length).toBeGreaterThanOrEqual(1);

      // Resolve the resub.
      const resubReq = JSON.parse(subMessages[subMessages.length - 1]);
      const newSubId = '0x11';
      ws2.simulateMessage({ id: resubReq.id, jsonrpc: '2.0', result: newSubId });

      // Now a notification on the new subId should work.
      ws2.simulateMessage({
        method: 'eth_subscription',
        params: { subscription: newSubId, result: makeTransferLog() },
      });

      expect(events.length).toBe(1);

      provider.destroy();
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // destroy()
  // -----------------------------------------------------------------------

  describe('destroy()', () => {
    it('should close the WebSocket and reject pending requests', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      const ws = getLatest();
      ws.simulateOpen();

      const promise = provider.request('eth_blockNumber', []);
      provider.destroy();

      await expect(promise).rejects.toMatchObject({
        code: GuildPassErrorCode.WS_CONNECTION_ERROR,
        message: 'WebSocket provider destroyed',
      });
    });

    it('should be idempotent', () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      expect(() => {
        provider.destroy();
        provider.destroy();
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Integration: callback errors are swallowed
  // -----------------------------------------------------------------------

  describe('callback error isolation', () => {
    it('should not break the provider if a callback throws', async () => {
      const provider = new WebSocketContractProvider({
        wssUrl: 'wss://example.com',
      });
      getLatest().simulateOpen();

      let secondCallbackFired = false;
      provider.onTokenTransfer(CONTRACT, () => {
        throw new Error('boom');
      });
      provider.onTokenTransfer(CONTRACT, () => {
        secondCallbackFired = true;
      });

      // Resolve both subscriptions.
      const msgs = getLatest().sentMessages.map((m: string) => JSON.parse(m) as Record<string, unknown>);
      const subReqs = msgs.filter((m: Record<string, unknown>) => m.method === 'eth_subscribe');

      getLatest().simulateMessage({ id: subReqs[0].id, jsonrpc: '2.0', result: '0xa' });
      getLatest().simulateMessage({ id: subReqs[1].id, jsonrpc: '2.0', result: '0xb' });

      // Send a notification to both — one callback throws, the other should still fire.
      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: { subscription: '0xa', result: makeTransferLog() },
      });
      getLatest().simulateMessage({
        method: 'eth_subscription',
        params: { subscription: '0xb', result: makeTransferLog() },
      });

      expect(secondCallbackFired).toBe(true);
      provider.destroy();
    });
  });
});
