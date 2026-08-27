/**
 * Generic middleware function type for async composition.
 * Follows Koa-style middleware semantics where:
 * - Pre-processing logic runs before awaiting next()
 * - Post-processing logic runs after awaiting next()
 * - Post-processing executes in reverse order (unwind)
 */
export type Middleware<TContext, TResult> = (
  context: TContext,
  next: () => Promise<TResult>
) => Promise<TResult>;

/**
 * Terminal handler that executes when all middleware have completed.
 * This is the final operation in the middleware chain.
 */
export type TerminalHandler<TContext, TResult> = (
  context: TContext
) => Promise<TResult>;
