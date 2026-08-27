import type { Middleware, TerminalHandler } from "./types.js";

/**
 * Error thrown when a middleware attempts to call next() more than once.
 */
export class MultipleNextCallsError extends Error {
  constructor() {
    super("Middleware cannot call next() more than once");
    this.name = "MultipleNextCallsError";
  }
}

/**
 * A middleware pipeline that composes middleware functions with deterministic execution order.
 * 
 * Execution semantics:
 * - Middleware execute in registration order (outer to inner)
 * - Post-processing (after await next()) executes in reverse order (inner to outer)
 * - Each middleware can only call next() once
 * - Errors propagate correctly through the chain
 * - Context is controlled by the caller (can be immutable or mutable)
 * 
 * @template TContext - The context type passed through middleware
 * @template TResult - The result type returned from the terminal handler
 */
export class MiddlewarePipeline<TContext, TResult> {
  private middleware: Middleware<TContext, TResult>[];

  constructor() {
    this.middleware = [];
  }

  /**
   * Add a middleware to the pipeline.
   * Middleware are executed in the order they are added.
   */
  use(middleware: Middleware<TContext, TResult>): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Execute the middleware pipeline with a terminal handler.
   * 
   * @param context - The context to pass through middleware
   * @param terminal - The final handler to execute after all middleware
   * @returns A promise that resolves with the terminal handler's result
   */
  async execute(
    context: TContext,
    terminal: TerminalHandler<TContext, TResult>
  ): Promise<TResult> {
    if (this.middleware.length === 0) {
      return terminal(context);
    }

    // Build the middleware chain from inside out
    // The innermost function is the terminal handler
    let chain: () => Promise<TResult> = () => terminal(context);

    // Wrap middleware in reverse order so they execute in registration order
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const middleware = this.middleware[i];
      const previousChain = chain;

      chain = this.createNextWrapper(context, middleware, previousChain);
    }

    return chain();
  }

  /**
   * Creates a next() function wrapper that:
   * - Tracks if next() has been called to prevent multiple calls
   * - Provides proper error propagation
   */
  private createNextWrapper(
    context: TContext,
    middleware: Middleware<TContext, TResult>,
    nextChain: () => Promise<TResult>
  ): () => Promise<TResult> {
    let nextCalled = false;

    const next = async (): Promise<TResult> => {
      if (nextCalled) {
        throw new MultipleNextCallsError();
      }
      nextCalled = true;
      return nextChain();
    };

    return () => middleware(context, next);
  }

  /**
   * Create a new pipeline with the same middleware.
   * This allows multiple independent pipelines without shared state.
   */
  clone(): MiddlewarePipeline<TContext, TResult> {
    const pipeline = new MiddlewarePipeline<TContext, TResult>();
    for (const middleware of this.middleware) {
      pipeline.use(middleware);
    }
    return pipeline;
  }
}
