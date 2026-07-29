/**
 * Middleware pipeline — orchestrates the ordered execution of
 * request, response, and error middleware.
 *
 * @module middleware
 */

import type {
  Middleware,
  RequestMiddlewarePayload,
  ResponseMiddlewarePayload,
  ErrorMiddlewarePayload,
} from './middleware.types';

/**
 * Options for running the request-phase middleware pipeline.
 */
export interface RunRequestOptions {
  /** The middleware instances, in registration order. */
  middleware: Middleware[];
  /** The initial request payload (prior to any middleware mutations). */
  payload: RequestMiddlewarePayload;
}

/**
 * Options for running the response-phase middleware pipeline.
 */
export interface RunResponseOptions {
  /** The middleware instances (same instances used for the request). */
  middleware: Middleware[];
  /** The (possibly mutated) request payload that was sent. */
  request: RequestMiddlewarePayload;
  /** The successful HTTP response to process. */
  response: { status: number; data: unknown; headers: Record<string, string>; durationMs: number };
}

/**
 * Runs all registered middleware in order on the request path.
 *
 * Each middleware's `onRequest` receives the payload (possibly modified by a
 * previous middleware).  Mutations to `payload.headers` and `payload.body`
 * are carried forward through the chain.
 *
 * If any middleware throws, the remaining chain is **not** executed for the
 * request phase; instead the error propagates up so the caller can deliver
 * it to the error path.
 */
export async function runRequestPipeline(
  opts: RunRequestOptions,
): Promise<RequestMiddlewarePayload> {
  let payload = opts.payload;

  for (const mw of opts.middleware) {
    if (!mw.onRequest) continue;

    try {
      await mw.onRequest(payload);
    } catch (err: unknown) {
      // Re-throw with middleware context for the error pipeline
      const error = err instanceof Error ? err : new Error(String(err));
      (error as any).__middlewareName = mw.name;
      throw error;
    }
  }

  return payload;
}

/**
 * Runs all registered middleware in **reverse** order on the response path.
 *
 * If any middleware's `onResponse` throws, the error pipeline is triggered
 * for the remaining middleware (in reverse order) before the error is
 * re-thrown.
 */
export async function runResponsePipeline(
  opts: RunResponseOptions,
): Promise<void> {
  const errs: { name: string; error: Error }[] = [];

  for (let i = opts.middleware.length - 1; i >= 0; i--) {
    const mw = opts.middleware[i];
    if (!mw.onResponse) continue;

    try {
      await mw.onResponse({
        request: opts.request,
        status: opts.response.status,
        data: opts.response.data,
        responseHeaders: opts.response.headers,
        durationMs: opts.response.durationMs,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      errs.push({ name: mw.name, error });
    }
  }

  // After all response middleware have run (successfully or not), propagate
  // any accumulated errors in reverse order.
  if (errs.length > 0) {
    // Deliver errors to the error pipeline of the remaining middleware.
    for (let i = opts.middleware.length - 1; i >= 0; i--) {
      const mw = opts.middleware[i];
      if (!mw.onError) continue;

      for (const e of errs) {
        try {
          await mw.onError({
            request: opts.request,
            error: e.error,
            durationMs: opts.response.durationMs,
          });
        } catch {
          // Swallow error-pipeline errors to avoid infinite recursion.
        }
      }
    }

    // Throw the first accumulated error so the caller sees a failure.
    throw errs[0].error;
  }
}

/**
 * Runs all registered middleware in **reverse** order on the error path.
 *
 * Every middleware that has `onError` is called, regardless of the results
 * of other middleware.  Errors thrown inside error middleware are silently
 * swallowed to prevent infinite error loops.
 */
export async function runErrorPipeline(
  middleware: Middleware[],
  payload: ErrorMiddlewarePayload,
): Promise<void> {
  for (let i = middleware.length - 1; i >= 0; i--) {
    const mw = middleware[i];
    if (!mw.onError) continue;

    try {
      await mw.onError(payload);
    } catch {
      // Swallow — error handlers must not throw.
    }
  }
}

/**
 * Convenience: create a middleware from named functions without
 * implementing the full interface.
 *
 * @example
 * ```typescript
 * const auth = createMiddleware('auth-header', {
 *   onRequest(payload) {
 *     payload.headers['Authorization'] = `Bearer ${token}`;
 *   },
 * });
 * ```
 */
export function createMiddleware(
  name: string,
  handlers: {
    onRequest?: (payload: RequestMiddlewarePayload) => void | Promise<void>;
    onResponse?: (payload: ResponseMiddlewarePayload) => void | Promise<void>;
    onError?: (payload: ErrorMiddlewarePayload) => void | Promise<void>;
  },
): Middleware {
  return {
    name,
    ...handlers,
  };
}
