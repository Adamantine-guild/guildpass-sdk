/**
 * Middleware types for the GuildPass SDK.
 *
 * ### Overview
 *
 * Middleware provides a clean extension point for consumers to intercept,
 * inspect, or modify HTTP requests and responses without forking the SDK.
 *
 * ### Execution order
 *
 * ```
 * Request:  M1 → M2 → M3 → HttpClient → Backend
 * Response: M1 ← M2 ← M3 ← HttpClient ← Backend
 * ```
 *
 * Registered middleware executes in registration order on the request path
 * and in reverse registration order on the response/error path.
 *
 * ### Error handling
 *
 * If a middleware's `onRequest` throws, the remaining pipeline is skipped and
 * the error is passed to each downstream middleware's `onError` in reverse
 * order, then re-thrown.  If `onResponse` throws, the same reverse-order
 * error propagation occurs.
 *
 * @module middleware
 */

import type { HttpMethod } from '../http/http.types';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

/** Information available to request-phase middleware. */
export interface RequestMiddlewarePayload {
  /** HTTP method (GET, POST, etc.). */
  method: HttpMethod;
  /** Request path relative to the base URL (e.g. `/v1/members`). */
  path: string;
  /** Mutable request headers.  Middleware may add/remove entries. */
  headers: Record<string, string>;
  /** The request body, if any.  Middleware may mutate it (e.g. wrap in an envelope). */
  body?: unknown;
}

/** Information available to response-phase middleware. */
export interface ResponseMiddlewarePayload {
  request: RequestMiddlewarePayload;
  /** HTTP status code. */
  status: number;
  /** Response body (parsed). */
  data: unknown;
  /** Raw response headers.  Read-only at this stage. */
  responseHeaders: Record<string, string>;
  /** Wall-clock duration of the HTTP call in milliseconds. */
  durationMs: number;
}

/** Information available to error-phase middleware. */
export interface ErrorMiddlewarePayload {
  request: RequestMiddlewarePayload;
  /** The error that was thrown. */
  error: Error;
  /** Wall-clock duration up to the point of failure, if available. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Middleware interface
// ---------------------------------------------------------------------------

/**
 * A single middleware component.
 *
 * Implement this interface (or provide plain functions with matching
 * signatures) to intercept the request/response lifecycle.
 *
 * @example
 * ```typescript
 * const loggingMiddleware: Middleware = {
 *   name: 'logging',
 *   onRequest(payload) {
 *     console.log(`[${payload.method}] ${payload.path}`);
 *   },
 *   onResponse(payload) {
 *     console.log(`[${payload.request.method}] ${payload.request.path} → ${payload.status}`);
 *   },
 *   onError(payload) {
 *     console.error(`[${payload.request.method}] ${payload.request.path} ✗`, payload.error);
 *   },
 * };
 * ```
 */
export interface Middleware {
  /** Human-readable label for debugging / error traces. */
  name: string;

  /**
   * Called before the HTTP request is dispatched.
   * Mutations to `payload.headers` and `payload.body` are carried forward.
   */
  onRequest?(payload: RequestMiddlewarePayload): void | Promise<void>;

  /**
   * Called after a successful HTTP response is received.
   * Throwing here will trigger the error path for downstream middleware.
   */
  onResponse?(payload: ResponseMiddlewarePayload): void | Promise<void>;

  /**
   * Called when `onRequest` or `onResponse` throws (or the network itself
   * fails).  Error-phase middleware runs in reverse registration order.
   */
  onError?(payload: ErrorMiddlewarePayload): void | Promise<void>;
}
