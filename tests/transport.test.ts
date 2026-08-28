import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTransport } from "../src/transport/HttpTransport.js";
import {
  CancellationError,
  HttpError,
  MalformedResponseError,
  NetworkError,
  TimeoutError,
} from "../src/errors/index.js";

const originalFetch = global.fetch;

describe("HttpTransport", () => {
  let transport: HttpTransport;

  beforeEach(() => {
    transport = new HttpTransport({ baseUrl: "https://api.example.com" });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should combine base URL and path safely", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));
    await transport.request({ method: "GET", path: "test" });
    expect(global.fetch).toHaveBeenCalledWith("https://api.example.com/test", expect.any(Object));

    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));
    await transport.request({ method: "GET", path: "/test2" });
    expect(global.fetch).toHaveBeenCalledWith("https://api.example.com/test2", expect.any(Object));
  });

  it("should return parsed JSON data on success", async () => {
    const mockResponse = new Response(JSON.stringify({ data: "ok" }), {
      status: 200,
    });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    const result = await transport.request<{ data: string }>({ method: "GET", path: "/test" });
    expect(result.data).toBe("ok");
  });

  it("should handle empty response correctly (e.g. 204)", async () => {
    const mockResponse = new Response(null, { status: 204 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    const result = await transport.request({ method: "POST", path: "/empty" });
    expect(result).toBeUndefined();
  });

  it("should serialise JSON request bodies", async () => {
    const mockResponse = new Response(JSON.stringify({}), { status: 200 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await transport.request({ method: "POST", path: "/test", body: { foo: "bar" } });
    
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/test",
      expect.objectContaining({
        body: JSON.stringify({ foo: "bar" }),
        headers: expect.any(Headers),
      })
    );
  });

  it("should throw HttpError on non-2xx responses", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));

    await expect(transport.request({ method: "GET", path: "/not-found" })).rejects.toThrow(HttpError);
    
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));
    try {
      await transport.request({ method: "GET", path: "/not-found" });
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.status).toBe(404);
      expect(err.metadata).toEqual({ message: "Not Found" });
    }
  });

  it("should throw NetworkError on fetch failure", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(transport.request({ method: "GET", path: "/network-fail" })).rejects.toThrow(NetworkError);
  });

  it("should throw MalformedResponseError on invalid JSON", async () => {
    const mockResponse = new Response("invalid json", { status: 200 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await expect(transport.request({ method: "GET", path: "/bad-json" })).rejects.toThrow(MalformedResponseError);
  });

  it("should throw TimeoutError when request times out", async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch).mockImplementationOnce(async (url, init) => {
      return new Promise((resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const promise = expect(transport.request({ method: "GET", path: "/timeout", timeoutMs: 100 })).rejects.toThrow(TimeoutError);
    
    await vi.advanceTimersByTimeAsync(150);
    
    await promise;
    
    vi.useRealTimers();
  });

  it("should throw CancellationError when request is aborted by caller", async () => {
    vi.mocked(global.fetch).mockImplementationOnce(async (url, init) => {
      return new Promise((resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const controller = new AbortController();
    const promise = transport.request({ method: "GET", path: "/abort", signal: controller.signal });
    
    controller.abort();
    
    await expect(promise).rejects.toThrow(CancellationError);
  });

  it("should handle already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(transport.request({ method: "GET", path: "/abort", signal: controller.signal })).rejects.toThrow(CancellationError);
  });
});
