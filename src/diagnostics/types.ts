/**
 * Listener function type for a specific event.
 * @template TEvent - The event payload type
 */
export type EventListener<TEvent> = (event: TEvent) => void;

/**
 * Event map interface that defines all possible events and their payload types.
 * Implementations should extend this interface with their specific events.
 *
 * @example
 * interface MyEvents {
 *   "request:start": { requestId: string; method: string };
 *   "request:end": { requestId: string; durationMs: number };
 * }
 */
export interface EventMap {
  [eventName: string]: unknown;
}

/**
 * Configuration options for the event bus.
 */
export interface EventBusOptions {
  /**
   * Maximum number of listeners per event to guard against memory leaks.
   * Set to Infinity to disable the limit.
   * @default 10
   */
  maxListeners?: number;

  /**
   * Whether to allow duplicate listener registrations.
   * When false, attempting to register the same listener function twice will throw.
   * @default true
   */
  allowDuplicateListeners?: boolean;

  /**
   * Whether to report listener errors via a callback instead of silently swallowing them.
   * If provided, listener errors will be passed to this callback instead of being suppressed.
   * @default undefined (errors are suppressed)
   */
  onError?: (error: unknown, eventName: string, listener: EventListener<unknown>) => void;
}
