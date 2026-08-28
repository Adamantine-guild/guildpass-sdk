import { describe, it, expect } from "vitest";
import { buildFingerprint, RequestFingerprintInput } from "../../src/fingerprint/builder.js";

describe("buildFingerprint", () => {
  it("produces identical fingerprints regardless of object key insertion order", async () => {
    const req1: RequestFingerprintInput = {
      method: "POST",
      path: "/api/test",
      body: { b: 2, a: 1, c: { y: 2, x: 1 } },
    };

    const req2: RequestFingerprintInput = {
      method: "POST",
      path: "/api/test",
      body: { a: 1, c: { x: 1, y: 2 }, b: 2 },
    };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);

    expect(f1).toBe(f2);
  });

  it("is case-insensitive for header names", async () => {
    const req1: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      headers: { "X-Custom-Header": "value1", Authorization: "token" },
    };

    const req2: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      headers: { "x-custom-header": "value1", authorization: "token" },
    };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);

    expect(f1).toBe(f2);
  });

  it("produces identical fingerprints regardless of query key insertion order", async () => {
    const req1: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      query: { b: "2", a: "1" },
    };

    const req2: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      query: { a: "1", b: "2" },
    };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);

    expect(f1).toBe(f2);
  });

  it("produces different fingerprints for semantically different requests", async () => {
    const req1: RequestFingerprintInput = { method: "GET", path: "/test", query: { a: "1" } };
    const req2: RequestFingerprintInput = { method: "POST", path: "/test", query: { a: "1" } };
    const req3: RequestFingerprintInput = { method: "GET", path: "/test2", query: { a: "1" } };
    const req4: RequestFingerprintInput = { method: "GET", path: "/test", query: { a: "2" } };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);
    const f3 = await buildFingerprint(req3);
    const f4 = await buildFingerprint(req4);

    expect(f1).not.toBe(f2);
    expect(f1).not.toBe(f3);
    expect(f1).not.toBe(f4);
  });

  it("preserves array order", async () => {
    const req1: RequestFingerprintInput = {
      method: "POST",
      path: "/test",
      body: [1, 2, 3],
    };

    const req2: RequestFingerprintInput = {
      method: "POST",
      path: "/test",
      body: [3, 2, 1],
    };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);

    expect(f1).not.toBe(f2);
  });

  it("excludes sensitive headers without affecting the fingerprint of non-sensitive ones", async () => {
    const req1: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      headers: { accept: "application/json", authorization: "Bearer token123" },
    };

    const req2: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      headers: { accept: "application/json", authorization: "Bearer differentToken" },
    };

    const req3: RequestFingerprintInput = {
      method: "GET",
      path: "/test",
      headers: { accept: "application/json" },
    };

    const f1 = await buildFingerprint(req1, ["authorization"]);
    const f2 = await buildFingerprint(req2, ["Authorization"]); // case-insensitive exclusion
    const f3 = await buildFingerprint(req3); // no authorization header present, not excluded

    expect(f1).toBe(f2);
    expect(f1).toBe(f3);
  });

  it("rejects unsupported body values safely", async () => {
    const req: RequestFingerprintInput = {
      method: "POST",
      path: "/test",
      body: { func: () => {} } as any,
    };

    await expect(buildFingerprint(req)).rejects.toThrow("Unsupported body value type: function");
  });

  it("does not mutate caller input", async () => {
    const originalQuery = { b: "2", a: "1" };
    const originalHeaders = { "B-Header": "2", "A-Header": "1" };
    const originalBody = { y: 2, x: 1 };

    const req: RequestFingerprintInput = {
      method: "get",
      path: "/test/  ",
      query: originalQuery,
      headers: originalHeaders,
      body: originalBody,
    };

    await buildFingerprint(req);

    expect(Object.keys(originalQuery)).toEqual(["b", "a"]);
    expect(Object.keys(originalHeaders)).toEqual(["B-Header", "A-Header"]);
    expect(Object.keys(originalBody)).toEqual(["y", "x"]);
    expect(req.method).toBe("get");
    expect(req.path).toBe("/test/  ");
  });

  it("produces deterministic output and lowercase hex for known input", async () => {
    const req: RequestFingerprintInput = {
      method: "GET",
      path: "/api/v1/test",
      query: { q: "search" },
      headers: { "x-test": "1" },
      body: null,
    };

    const hash = await buildFingerprint(req);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 is 64 hex chars

    const hash2 = await buildFingerprint(req);
    expect(hash).toBe(hash2);
  });

  it("strips trailing slashes from paths unless it is root", async () => {
    const req1: RequestFingerprintInput = { method: "GET", path: "/api/v1//" };
    const req2: RequestFingerprintInput = { method: "GET", path: "/api/v1" };

    const f1 = await buildFingerprint(req1);
    const f2 = await buildFingerprint(req2);

    expect(f1).toBe(f2);

    const req3: RequestFingerprintInput = { method: "GET", path: "/" };
    const req4: RequestFingerprintInput = { method: "GET", path: "//" };

    const f3 = await buildFingerprint(req3);
    const f4 = await buildFingerprint(req4);

    expect(f3).toBe(f4);
  });
});
