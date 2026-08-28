import { describe, expect, it } from "vitest";
import {
  MiddlewarePipeline,
  MultipleNextCallsError,
  type Middleware,
  type TerminalHandler,
} from "../src/middleware/index.js";

describe("MiddlewarePipeline", () => {
  describe("execution order", () => {
    it("executes middleware in registration order (outer to inner)", async () => {
      const events: string[] = [];
      const pipeline = new MiddlewarePipeline<{ trace: string[] }, string>();

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("middleware1-pre");
        const result = await next();
        ctx.trace.push("middleware1-post");
        return result;
      });

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("middleware2-pre");
        const result = await next();
        ctx.trace.push("middleware2-post");
        return result;
      });

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("middleware3-pre");
        const result = await next();
        ctx.trace.push("middleware3-post");
        return result;
      });

      const context = { trace: events };
      const terminal: TerminalHandler<typeof context, string> = async (ctx) => {
        ctx.trace.push("terminal");
        return "result";
      };

      const result = await pipeline.execute(context, terminal);

      expect(result).toBe("result");
      expect(events).toEqual([
        "middleware1-pre",
        "middleware2-pre",
        "middleware3-pre",
        "terminal",
        "middleware3-post",
        "middleware2-post",
        "middleware1-post",
      ]);
    });

    it("executes post-processing in reverse unwind order", async () => {
      const events: string[] = [];
      const pipeline = new MiddlewarePipeline<{ trace: string[] }, void>();

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("A");
        await next();
        ctx.trace.push("a");
      });

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("B");
        await next();
        ctx.trace.push("b");
      });

      pipeline.use(async (ctx, next) => {
        ctx.trace.push("C");
        await next();
        ctx.trace.push("c");
      });

      const context = { trace: events };
      const terminal: TerminalHandler<typeof context, void> = async (ctx) => {
        ctx.trace.push("T");
      };

      await pipeline.execute(context, terminal);

      expect(events).toEqual(["A", "B", "C", "T", "c", "b", "a"]);
    });
  });

  describe("next() call protection", () => {
    it("rejects multiple next() calls from the same middleware", async () => {
      const pipeline = new MiddlewarePipeline<void, void>();

      pipeline.use(async (_ctx, next) => {
        await next();
        await expect(next()).rejects.toThrow(MultipleNextCallsError);
      });

      const terminal: TerminalHandler<void, void> = async () => {};

      await pipeline.execute(undefined, terminal);
    });

    it("allows different middleware to each call next() once", async () => {
      const events: number[] = [];
      const pipeline = new MiddlewarePipeline<{ count: number[] }, void>();

      pipeline.use(async (ctx, next) => {
        ctx.count.push(1);
        await next();
        ctx.count.push(2);
      });

      pipeline.use(async (ctx, next) => {
        ctx.count.push(3);
        await next();
        ctx.count.push(4);
      });

      const context = { count: events };
      const terminal: TerminalHandler<typeof context, void> = async () => {};

      await pipeline.execute(context, terminal);

      expect(events).toEqual([1, 3, 4, 2]);
    });
  });

  describe("error propagation", () => {
    it("propagates errors from terminal handler", async () => {
      const pipeline = new MiddlewarePipeline<void, void>();

      pipeline.use(async (_ctx, next) => {
        await next();
      });

      const terminal: TerminalHandler<void, void> = async () => {
        throw new Error("Terminal error");
      };

      await expect(pipeline.execute(undefined, terminal)).rejects.toThrow("Terminal error");
    });

    it("propagates errors from inner middleware", async () => {
      const pipeline = new MiddlewarePipeline<void, void>();

      pipeline.use(async (_ctx, next) => {
        await next();
      });

      pipeline.use(async (_ctx, _next) => {
        throw new Error("Middleware error");
      });

      const terminal: TerminalHandler<void, void> = async () => {};

      await expect(pipeline.execute(undefined, terminal)).rejects.toThrow("Middleware error");
    });

    it("allows middleware to catch and handle errors from inner middleware", async () => {
      const events: string[] = [];
      const pipeline = new MiddlewarePipeline<{ trace: string[] }, void>();

      pipeline.use(async (ctx, next) => {
        try {
          await next();
        } catch (error) {
          ctx.trace.push(`caught: ${(error as Error).message}`);
        }
      });

      pipeline.use(async (_ctx, _next) => {
        throw new Error("Inner error");
      });

      const context = { trace: events };
      const terminal: TerminalHandler<typeof context, void> = async () => {};

      await pipeline.execute(context, terminal);

      expect(events).toEqual(["caught: Inner error"]);
    });
  });

  describe("result transformation", () => {
    it("allows middleware to transform the result", async () => {
      const pipeline = new MiddlewarePipeline<void, string>();

      pipeline.use(async (_ctx, next) => {
        const result = await next();
        return result.toUpperCase();
      });

      pipeline.use(async (_ctx, next) => {
        const result = await next();
        return result + " world";
      });

      const terminal: TerminalHandler<void, string> = async () => "hello";

      const result = await pipeline.execute(undefined, terminal);

      expect(result).toBe("HELLO WORLD");
    });

    it("allows middleware to not transform the result", async () => {
      const pipeline = new MiddlewarePipeline<void, string>();

      pipeline.use(async (_ctx, next) => {
        return next();
      });

      const terminal: TerminalHandler<void, string> = async () => "original";

      const result = await pipeline.execute(undefined, terminal);

      expect(result).toBe("original");
    });
  });

  describe("empty pipeline", () => {
    it("executes terminal handler directly when middleware list is empty", async () => {
      const events: string[] = [];
      const pipeline = new MiddlewarePipeline<{ trace: string[] }, string>();

      const context = { trace: events };
      const terminal: TerminalHandler<typeof context, string> = async (ctx) => {
        ctx.trace.push("terminal");
        return "result";
      };

      const result = await pipeline.execute(context, terminal);

      expect(result).toBe("result");
      expect(events).toEqual(["terminal"]);
    });
  });

  describe("independent pipelines", () => {
    it("does not share state between multiple pipeline instances", async () => {
      const pipeline1 = new MiddlewarePipeline<void, string>();
      const pipeline2 = new MiddlewarePipeline<void, string>();

      pipeline1.use(async (_ctx, next) => {
        const result = await next();
        return result + "-pipeline1";
      });

      pipeline2.use(async (_ctx, next) => {
        const result = await next();
        return result + "-pipeline2";
      });

      const terminal: TerminalHandler<void, string> = async () => "base";

      const result1 = await pipeline1.execute(undefined, terminal);
      const result2 = await pipeline2.execute(undefined, terminal);

      expect(result1).toBe("base-pipeline1");
      expect(result2).toBe("base-pipeline2");
    });

    it("clone creates independent pipeline with same middleware", async () => {
      const original = new MiddlewarePipeline<void, string>();

      original.use(async (_ctx, next) => {
        const result = await next();
        return result + "-middleware";
      });

      const cloned = original.clone();

      // Add different middleware to original
      original.use(async (_ctx, next) => {
        const result = await next();
        return result + "-original-only";
      });

      const terminal: TerminalHandler<void, string> = async () => "base";

      const resultOriginal = await original.execute(undefined, terminal);
      const resultCloned = await cloned.execute(undefined, terminal);

      expect(resultOriginal).toBe("base-original-only-middleware");
      expect(resultCloned).toBe("base-middleware");
    });
  });

  describe("context semantics", () => {
    it("supports immutable context (caller controls mutations)", async () => {
      const pipeline = new MiddlewarePipeline<{ value: number }, number>();

      pipeline.use(async (ctx, next) => {
        // Middleware can read context
        const originalValue = ctx.value;
        const result = await next();
        // Context remains unchanged for caller
        expect(ctx.value).toBe(originalValue);
        return result;
      });

      const context = { value: 42 };
      const terminal: TerminalHandler<typeof context, number> = async (ctx) => {
        return ctx.value * 2;
      };

      const result = await pipeline.execute(context, terminal);

      expect(result).toBe(84);
      expect(context.value).toBe(42);
    });

    it("supports mutable context (caller allows mutations)", async () => {
      const pipeline = new MiddlewarePipeline<{ value: number }, number>();

      pipeline.use(async (ctx, next) => {
        ctx.value = ctx.value + 10;
        return next();
      });

      const context = { value: 42 };
      const terminal: TerminalHandler<typeof context, number> = async (ctx) => {
        return ctx.value * 2;
      };

      const result = await pipeline.execute(context, terminal);

      expect(result).toBe(104); // (42 + 10) * 2
      expect(context.value).toBe(52);
    });
  });

  describe("method chaining", () => {
    it("supports fluent API with use() returning this", async () => {
      const pipeline = new MiddlewarePipeline<void, string>();

      const result = await pipeline
        .use(async (_ctx, next) => {
          const result = await next();
          return result + "1";
        })
        .use(async (_ctx, next) => {
          const result = await next();
          return result + "2";
        })
        .execute(undefined, async () => "0");

      expect(result).toBe("021");
    });
  });
});
