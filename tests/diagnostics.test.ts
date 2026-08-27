import { describe, expect, it, vi } from "vitest";
import {
  EventBus,
  MaxListenersError,
  DuplicateListenerError,
  type DiagnosticsEvents,
} from "../src/diagnostics/index.js";

describe("EventBus", () => {
  describe("type safety", () => {
    it("enforces event payload types", () => {
      const bus = new EventBus<DiagnosticsEvents>();

      // Valid payload
      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      // @ts-expect-error - Invalid payload type
      bus.emit("request:start", {
        requestId: "123",
        // method is missing
        path: "/api/test",
      });
    });

    it("type-checks listener signatures", () => {
      const bus = new EventBus<DiagnosticsEvents>();

      // Valid listener
      bus.subscribe("request:start", (event) => {
        expect(event.method).toBeTypeOf("string");
      });

      // @ts-expect-error - Invalid event name
      bus.subscribe("invalid:event", (event) => {
        // This should not compile
      });
    });
  });

  describe("subscription lifecycle", () => {
    it("subscribes listeners to events", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      bus.subscribe("request:start", listener);
      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });
    });

    it("returns unsubscribe function", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      const unsubscribe = bus.subscribe("request:start", listener);
      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      bus.emit("request:start", {
        requestId: "456",
        method: "POST",
        path: "/api/test2",
      });

      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it("unsubscribes specific listener", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bus.subscribe("request:start", listener1);
      bus.subscribe("request:start", listener2);

      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      bus.unsubscribe("request:start", listener1);
      bus.emit("request:start", {
        requestId: "456",
        method: "POST",
        path: "/api/test2",
      });

      expect(listener1).toHaveBeenCalledTimes(1); // Not called again
      expect(listener2).toHaveBeenCalledTimes(2); // Called again
    });

    it("removes listeners from internal collections when unsubscribed", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      bus.subscribe("request:start", listener);
      expect(bus.listenerCount("request:start")).toBe(1);

      bus.unsubscribe("request:start", listener);
      expect(bus.listenerCount("request:start")).toBe(0);
    });
  });

  describe("multiple listeners", () => {
    it("invokes all listeners for an event", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      bus.subscribe("request:start", listener1);
      bus.subscribe("request:start", listener2);
      bus.subscribe("request:start", listener3);

      const event = {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      };
      bus.emit("request:start", event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
      expect(listener3).toHaveBeenCalledWith(event);
    });

    it("invokes listeners in subscription order", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const order: number[] = [];

      bus.subscribe("request:start", () => order.push(1));
      bus.subscribe("request:start", () => order.push(2));
      bus.subscribe("request:start", () => order.push(3));

      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("listener failure isolation", () => {
    it("continues invoking listeners after one throws", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener1 = vi.fn(() => {
        throw new Error("Listener 1 failed");
      });
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      bus.subscribe("request:start", listener1);
      bus.subscribe("request:start", listener2);
      bus.subscribe("request:start", listener3);

      const event = {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      };

      // Should not throw
      expect(() => bus.emit("request:start", event)).not.toThrow();

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
      expect(listener3).toHaveBeenCalledWith(event);
    });

    it("reports listener errors via onError callback", () => {
      const onError = vi.fn();
      const bus = new EventBus<DiagnosticsEvents>({ onError });

      const listener = vi.fn(() => {
        throw new Error("Listener failed");
      });

      bus.subscribe("request:start", listener);

      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        "request:start",
        listener
      );
    });

    it("silently suppresses errors when no onError callback", () => {
      const bus = new EventBus<DiagnosticsEvents>();

      const listener = vi.fn(() => {
        throw new Error("Listener failed");
      });

      bus.subscribe("request:start", listener);

      // Should not throw
      expect(() =>
        bus.emit("request:start", {
          requestId: "123",
          method: "GET",
          path: "/api/test",
        })
      ).not.toThrow();
    });
  });

  describe("capacity handling", () => {
    it("enforces maximum listener limit", () => {
      const bus = new EventBus<DiagnosticsEvents>({ maxListeners: 2 });
      const listener = vi.fn();

      bus.subscribe("request:start", listener);
      bus.subscribe("request:start", listener);

      expect(() =>
        bus.subscribe("request:start", listener)
      ).toThrowError(MaxListenersError);
    });

    it("allows unlimited listeners when maxListeners is Infinity", () => {
      const bus = new EventBus<DiagnosticsEvents>({
        maxListeners: Infinity,
      });
      const listener = vi.fn();

      // Should not throw
      expect(() => {
        for (let i = 0; i < 100; i++) {
          bus.subscribe("request:start", listener);
        }
      }).not.toThrow();
    });

    it("uses default maxListeners of 10", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      // Should allow 10 listeners
      for (let i = 0; i < 10; i++) {
        bus.subscribe("request:start", listener);
      }

      // Should throw on 11th
      expect(() => bus.subscribe("request:start", listener)).toThrowError(
        MaxListenersError
      );
    });
  });

  describe("duplicate listener prevention", () => {
    it("prevents duplicate listener registration when disabled", () => {
      const bus = new EventBus<DiagnosticsEvents>({
        allowDuplicateListeners: false,
      });
      const listener = vi.fn();

      bus.subscribe("request:start", listener);

      expect(() =>
        bus.subscribe("request:start", listener)
      ).toThrowError(DuplicateListenerError);
    });

    it("allows duplicate listener registration by default", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      bus.subscribe("request:start", listener);
      bus.subscribe("request:start", listener);

      // Should not throw
      expect(bus.listenerCount("request:start")).toBe(2);
    });
  });

  describe("diagnostics", () => {
    it("returns listener count for specific event", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      expect(bus.listenerCount("request:start")).toBe(0);

      bus.subscribe("request:start", listener);
      expect(bus.listenerCount("request:start")).toBe(1);

      bus.subscribe("request:start", listener);
      expect(bus.listenerCount("request:start")).toBe(2);

      bus.unsubscribe("request:start", listener);
      expect(bus.listenerCount("request:start")).toBe(1);
    });

    it("returns all event names with listeners", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      expect(bus.eventNames()).toEqual([]);

      bus.subscribe("request:start", listener);
      bus.subscribe("request:end", listener);

      const eventNames = bus.eventNames();
      expect(eventNames).toContain("request:start");
      expect(eventNames).toContain("request:end");
      expect(eventNames.length).toBe(2);
    });
  });

  describe("cleanup", () => {
    it("removes all listeners for specific event", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bus.subscribe("request:start", listener1);
      bus.subscribe("request:start", listener2);
      bus.subscribe("request:end", listener1);

      expect(bus.listenerCount("request:start")).toBe(2);
      expect(bus.listenerCount("request:end")).toBe(1);

      bus.removeAllListeners("request:start");

      expect(bus.listenerCount("request:start")).toBe(0);
      expect(bus.listenerCount("request:end")).toBe(1);
    });

    it("removes all listeners when no event name specified", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn();

      bus.subscribe("request:start", listener);
      bus.subscribe("request:end", listener);
      bus.subscribe("sdk:warning", listener);

      expect(bus.eventNames().length).toBe(3);

      bus.removeAllListeners();

      expect(bus.eventNames().length).toBe(0);
      expect(bus.listenerCount("request:start")).toBe(0);
      expect(bus.listenerCount("request:end")).toBe(0);
      expect(bus.listenerCount("sdk:warning")).toBe(0);
    });
  });

  describe("different event types", () => {
    it("handles different event payload types correctly", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const requestListener = vi.fn();
      const warningListener = vi.fn();

      bus.subscribe("request:start", requestListener);
      bus.subscribe("sdk:warning", warningListener);

      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      bus.emit("sdk:warning", {
        code: "WARN001",
        message: "Test warning",
      });

      expect(requestListener).toHaveBeenCalledTimes(1);
      expect(warningListener).toHaveBeenCalledTimes(1);

      expect(requestListener).toHaveBeenCalledWith({
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(warningListener).toHaveBeenCalledWith({
        code: "WARN001",
        message: "Test warning",
      });
    });
  });

  describe("synchronous semantics", () => {
    it("invokes listeners synchronously", () => {
      const bus = new EventBus<DiagnosticsEvents>();
      const order: number[] = [];

      bus.subscribe("request:start", () => {
        order.push(1);
      });

      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      order.push(2);

      expect(order).toEqual([1, 2]);
    });
  });

  describe("no console logging", () => {
    it("does not log to console by default", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const bus = new EventBus<DiagnosticsEvents>();
      const listener = vi.fn(() => {
        throw new Error("Listener failed");
      });

      bus.subscribe("request:start", listener);
      bus.emit("request:start", {
        requestId: "123",
        method: "GET",
        path: "/api/test",
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("custom event maps", () => {
    it("supports custom event map extensions", () => {
      interface CustomEvents {
        "custom:event": { customData: string };
      }

      const bus = new EventBus<CustomEvents>();
      const listener = vi.fn();

      bus.subscribe("custom:event", listener);
      bus.emit("custom:event", { customData: "test" });

      expect(listener).toHaveBeenCalledWith({ customData: "test" });
    });
  });
});
