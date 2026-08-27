import type { EventListener, EventMap, EventBusOptions } from "./types.js";

/**
 * Error thrown when maximum listener limit is exceeded.
 */
export class MaxListenersError extends Error {
  constructor(eventName: string, maxListeners: number) {
    super(`Maximum listeners (${maxListeners}) exceeded for event "${eventName}"`);
    this.name = "MaxListenersError";
  }
}

/**
 * Error thrown when duplicate listener registration is attempted but not allowed.
 */
export class DuplicateListenerError extends Error {
  constructor(eventName: string) {
    super(`Duplicate listener registration for event "${eventName}"`);
    this.name = "DuplicateListenerError";
  }
}

/**
 * A typed event bus for SDK diagnostics and observability.
 *
 * Features:
 * - Strongly typed event names and payloads
 * - Subscribe/unsubscribe with lifecycle management
 * - Deterministic listener invocation order
 * - Listener failure isolation (one listener throwing doesn't affect others)
 * - Maximum listener limits to guard against leaks
 * - Duplicate listener prevention (optional)
 * - No console logging by default
 *
 * @template TEvents - Event map interface defining event names and payload types
 */
export class EventBus<TEvents extends EventMap> {
  private readonly listeners: Map<keyof TEvents, Array<EventListener<unknown>>> = new Map();

  private readonly maxListeners: number;
  private readonly allowDuplicateListeners: boolean;
  private readonly onError?: EventBusOptions["onError"];

  constructor(options: EventBusOptions = {}) {
    this.maxListeners = options.maxListeners ?? 10;
    this.allowDuplicateListeners = options.allowDuplicateListeners ?? true;
    this.onError = options.onError;
  }

  /**
   * Subscribe to an event.
   *
   * @param eventName - The name of the event to subscribe to
   * @param listener - The listener function to call when the event is emitted
   * @returns An unsubscribe function that removes the listener when called
   * @throws {MaxListenersError} If maximum listener limit is exceeded
   * @throws {DuplicateListenerError} If duplicate registration is not allowed
   */
  subscribe<K extends keyof TEvents>(
    eventName: K,
    listener: EventListener<TEvents[K]>,
  ): () => void {
    const eventListeners = this.listeners.get(eventName);

    if (!eventListeners) {
      const newArray: Array<EventListener<unknown>> = [];
      newArray.push(listener as EventListener<unknown>);
      this.listeners.set(eventName, newArray);
      return () => this.unsubscribe(eventName, listener);
    }

    // Check max listeners limit
    if (eventListeners.length >= this.maxListeners) {
      throw new MaxListenersError(String(eventName), this.maxListeners);
    }

    // Check for duplicate listeners if not allowed
    if (
      !this.allowDuplicateListeners &&
      eventListeners.includes(listener as EventListener<unknown>)
    ) {
      throw new DuplicateListenerError(String(eventName));
    }

    eventListeners.push(listener as EventListener<unknown>);

    // Return unsubscribe function
    return () => this.unsubscribe(eventName, listener);
  }

  /**
   * Unsubscribe a listener from an event.
   *
   * @param eventName - The name of the event to unsubscribe from
   * @param listener - The listener function to remove
   */
  unsubscribe<K extends keyof TEvents>(eventName: K, listener: EventListener<TEvents[K]>): void {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener as EventListener<unknown>);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }

      // Clean up empty arrays to avoid memory retention
      if (eventListeners.length === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  /**
   * Emit an event to all subscribed listeners.
   *
   * Listeners are invoked in the order they were subscribed.
   * If a listener throws, the error is caught and reported via onError callback (if provided),
   * but does not prevent other listeners from being invoked.
   *
   * @param eventName - The name of the event to emit
   * @param event - The event payload to pass to listeners
   */
  emit<K extends keyof TEvents>(eventName: K, event: TEvents[K]): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners || eventListeners.length === 0) {
      return;
    }

    // Create a copy to preserve order and avoid issues if listeners modify during iteration
    const listenersArray = [...eventListeners];

    for (const listener of listenersArray) {
      try {
        (listener as EventListener<TEvents[K]>)(event);
      } catch (error) {
        // Isolate listener failures
        if (this.onError) {
          this.onError(error, String(eventName), listener);
        }
        // If no error handler, silently suppress the error
      }
    }
  }

  /**
   * Get the number of listeners for a specific event.
   *
   * @param eventName - The name of the event
   * @returns The number of listeners subscribed to the event
   */
  listenerCount<K extends keyof TEvents>(eventName: K): number {
    const eventListeners = this.listeners.get(eventName);
    return eventListeners?.length ?? 0;
  }

  /**
   * Remove all listeners for a specific event, or all events if no event name is provided.
   *
   * @param eventName - Optional event name to clear listeners for. If omitted, all listeners are removed.
   */
  removeAllListeners<K extends keyof TEvents>(eventName?: K): void {
    if (eventName !== undefined) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the names of all events that currently have listeners.
   *
   * @returns Array of event names with active listeners
   */
  eventNames(): Array<keyof TEvents> {
    return Array.from(this.listeners.keys());
  }
}
