import { describe, expect, it } from "vitest";
import {
  composeHeaders,
  composeHeadersInstance,
  InvalidHeaderNameError,
  InvalidHeaderValueError,
  ProtectedHeaderOverrideError,
  type HeadersSource,
} from "../src/headers/index.js";

describe("Header Composition", () => {
  describe("case-insensitive merging", () => {
    it("merges headers with different casing as the same header", () => {
      const sources: HeadersSource[] = [
        { "X-Custom-Header": "value1" },
        { "x-custom-header": "value2" },
      ];

      const result = composeHeaders(sources);

      // Should only have one x-custom-header header
      expect(Object.keys(result)).toHaveLength(1);
      expect(result["x-custom-header"]).toBe("value2"); // Later source wins
    });

    it("normalizes header names to lowercase by default", () => {
      const sources: HeadersSource[] = [
        { "Content-Type": "application/json" },
        { "X-Custom-Header": "value" },
      ];

      const result = composeHeaders(sources);

      expect(Object.keys(result)).toEqual(["content-type", "x-custom-header"]);
    });

    it("preserves original case when preserveCase is true", () => {
      const sources: HeadersSource[] = [
        { "Content-Type": "application/json" },
        { "X-Custom-Header": "value" },
      ];

      const result = composeHeaders(sources, { preserveCase: true });

      expect(Object.keys(result)).toEqual(["Content-Type", "X-Custom-Header"]);
    });

    it("handles mixed case in input correctly", () => {
      const sources: HeadersSource[] = [
        { "X-Custom": "value1" },
        { "x-custom": "value2" },
        { "X-CUSTOM": "value3" },
      ];

      const result = composeHeaders(sources);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result["x-custom"]).toBe("value3");
    });
  });

  describe("precedence rules", () => {
    it("later sources override earlier sources", () => {
      const sources: HeadersSource[] = [
        { "x-custom": "value1" },
        { "x-custom": "value2" },
        { "x-custom": "value3" },
      ];

      const result = composeHeaders(sources);

      expect(result["x-custom"]).toBe("value3");
    });

    it("merges different headers from multiple sources", () => {
      const sources: HeadersSource[] = [
        { "content-type": "application/json" },
        { "authorization": "Bearer token" },
        { "x-custom": "value" },
      ];

      const result = composeHeaders(sources);

      expect(result["content-type"]).toBe("application/json");
      expect(result["authorization"]).toBe("Bearer token");
      expect(result["x-custom"]).toBe("value");
    });

    it("handles empty sources array", () => {
      const result = composeHeaders([]);

      expect(result).toEqual({});
    });

    it("handles single source", () => {
      const sources: HeadersSource[] = [{ "content-type": "application/json" }];

      const result = composeHeaders(sources);

      expect(result["content-type"]).toBe("application/json");
    });
  });

  describe("protected headers", () => {
    it("prevents overriding default protected headers", () => {
      const sources: HeadersSource[] = [
        { authorization: "Bearer token1" },
        { authorization: "Bearer token2" },
      ];

      expect(() => composeHeaders(sources)).toThrowError(
        ProtectedHeaderOverrideError
      );
    });

    it("prevents overriding custom protected headers", () => {
      const sources: HeadersSource[] = [
        { "x-api-key": "key1" },
        { "x-api-key": "key2" },
      ];

      expect(() =>
        composeHeaders(sources, {
          protectedHeaders: new Set(["x-api-key"]),
        })
      ).toThrowError(ProtectedHeaderOverrideError);
    });

    it("allows overriding protected headers when allowOverride is true", () => {
      const sources: HeadersSource[] = [
        { authorization: "Bearer token1" },
        { authorization: "Bearer token2" },
      ];

      const result = composeHeaders(sources, { allowOverride: true });

      expect(result["authorization"]).toBe("Bearer token2");
    });

    it("allows setting protected header in first source only", () => {
      const sources: HeadersSource[] = [
        { authorization: "Bearer token" },
        { "content-type": "application/json" },
      ];

      const result = composeHeaders(sources);

      expect(result["authorization"]).toBe("Bearer token");
      expect(result["content-type"]).toBe("application/json");
    });

    it("respects case-insensitivity for protected headers", () => {
      const sources: HeadersSource[] = [
        { Authorization: "Bearer token1" },
        { authorization: "Bearer token2" },
      ];

      expect(() => composeHeaders(sources)).toThrowError(
        ProtectedHeaderOverrideError
      );
    });
  });

  describe("invalid header names", () => {
    it("rejects empty header name", () => {
      const sources: HeadersSource[] = [{ "": "value" }];

      expect(() => composeHeaders(sources)).toThrowError(InvalidHeaderNameError);
    });

    it("rejects header name with newline", () => {
      const sources: HeadersSource[] = [{ "x-inject\n": "value" }];

      expect(() => composeHeaders(sources)).toThrowError(InvalidHeaderNameError);
    });

    it("rejects header name with carriage return", () => {
      const sources: HeadersSource[] = [{ "x-inject\r": "value" }];

      expect(() => composeHeaders(sources)).toThrowError(InvalidHeaderNameError);
    });

    it("rejects header name with invalid characters", () => {
      const sources: HeadersSource[] = [{ "x-invalid@": "value" }];

      expect(() => composeHeaders(sources)).toThrowError(InvalidHeaderNameError);
    });

    it("rejects header name with space", () => {
      const sources: HeadersSource[] = [{ "x invalid": "value" }];

      expect(() => composeHeaders(sources)).toThrowError(InvalidHeaderNameError);
    });

    it("accepts valid header names with special characters", () => {
      const sources: HeadersSource[] = [
        { "x-custom-header": "value" },
        { "X-API-Key": "value" },
        { "content-type": "value" },
      ];

      expect(() => composeHeaders(sources)).not.toThrow();
    });
  });

  describe("invalid header values", () => {
    it("rejects header value with newline", () => {
      const sources: HeadersSource[] = [{ "x-header": "value\ninjected" }];

      expect(() => composeHeaders(sources)).toThrowError(
        InvalidHeaderValueError
      );
    });

    it("rejects header value with carriage return", () => {
      const sources: HeadersSource[] = [{ "x-header": "value\rinjected" }];

      expect(() => composeHeaders(sources)).toThrowError(
        InvalidHeaderValueError
      );
    });

    it("rejects header value with null byte", () => {
      const sources: HeadersSource[] = [{ "x-header": "value\0injected" }];

      expect(() => composeHeaders(sources)).toThrowError(
        InvalidHeaderValueError
      );
    });

    it("accepts valid header values", () => {
      const sources: HeadersSource[] = [
        { "content-type": "application/json" },
        { "authorization": "Bearer token" },
        { "x-custom": "value with spaces" },
      ];

      expect(() => composeHeaders(sources)).not.toThrow();
    });
  });

  describe("mutation safety", () => {
    it("does not mutate input objects", () => {
      const source1 = { "content-type": "application/json" };
      const source2 = { authorization: "Bearer token" };
      const sources: HeadersSource[] = [source1, source2];

      const originalSource1 = { ...source1 };
      const originalSource2 = { ...source2 };

      composeHeaders(sources);

      expect(source1).toEqual(originalSource1);
      expect(source2).toEqual(originalSource2);
    });

    it("does not mutate Headers instances", () => {
      const headers = new Headers({
        "content-type": "application/json",
      });
      const sources: HeadersSource[] = [headers];

      const originalContentType = headers.get("content-type");

      composeHeaders(sources);

      expect(headers.get("content-type")).toBe(originalContentType);
    });

    it("returns a new object each time", () => {
      const sources: HeadersSource[] = [{ "content-type": "application/json" }];

      const result1 = composeHeaders(sources);
      const result2 = composeHeaders(sources);

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });

  describe("Headers instance support", () => {
    it("handles Headers instances as sources", () => {
      const headers = new Headers({
        "content-type": "application/json",
        authorization: "Bearer token",
      });
      const sources: HeadersSource[] = [headers];

      const result = composeHeaders(sources);

      expect(result["content-type"]).toBe("application/json");
      expect(result["authorization"]).toBe("Bearer token");
    });

    it("mixes Headers instances and plain objects", () => {
      const headers = new Headers({ "content-type": "application/json" });
      const sources: HeadersSource[] = [
        headers,
        { authorization: "Bearer token" },
      ];

      const result = composeHeaders(sources);

      expect(result["content-type"]).toBe("application/json");
      expect(result["authorization"]).toBe("Bearer token");
    });

    it("validates Headers instance content", () => {
      // Headers API already validates its own content during construction/append
      // Our validation is a safety net for any values that might bypass Headers API
      // Since Headers API is strict, we test that our validation doesn't break valid Headers
      const headers = new Headers({ "x-header": "valid value" });
      const sources: HeadersSource[] = [headers];

      expect(() => composeHeaders(sources)).not.toThrow();
    });
  });

  describe("composeHeadersInstance", () => {
    it("returns a Headers instance", () => {
      const sources: HeadersSource[] = [
        { "content-type": "application/json" },
      ];

      const result = composeHeadersInstance(sources);

      expect(result).toBeInstanceOf(Headers);
      expect(result.get("content-type")).toBe("application/json");
    });

    it("applies composition options to Headers instance", () => {
      const sources: HeadersSource[] = [
        { authorization: "Bearer token1" },
        { authorization: "Bearer token2" },
      ];

      const result = composeHeadersInstance(sources, { allowOverride: true });

      expect(result.get("authorization")).toBe("Bearer token2");
    });

    it("preserves case in Headers instance when preserveCase is true", () => {
      const sources: HeadersSource[] = [
        { "Content-Type": "application/json" },
      ];

      const result = composeHeadersInstance(sources, { preserveCase: true });

      // Headers API normalizes to lowercase, but we check the construction worked
      expect(result.get("Content-Type")).toBe("application/json");
      expect(result.get("content-type")).toBe("application/json");
    });
  });

  describe("deterministic behavior", () => {
    it("produces consistent output for same input", () => {
      const sources: HeadersSource[] = [
        { "content-type": "application/json" },
        { authorization: "Bearer token" },
      ];

      const result1 = composeHeaders(sources);
      const result2 = composeHeaders(sources);

      expect(result1).toEqual(result2);
    });

    it("maintains insertion order of different headers", () => {
      const sources: HeadersSource[] = [
        { "x-first": "value1" },
        { "x-second": "value2" },
        { "x-third": "value3" },
      ];

      const result = composeHeaders(sources);
      const keys = Object.keys(result);

      expect(keys).toEqual(["x-first", "x-second", "x-third"]);
    });
  });

  describe("edge cases", () => {
    it("handles empty header values", () => {
      const sources: HeadersSource[] = [{ "x-empty": "" }];

      const result = composeHeaders(sources);

      expect(result["x-empty"]).toBe("");
    });

    it("handles header values with special characters", () => {
      const sources: HeadersSource[] = [
        { "x-special": "value!@#$%^&*()_+-=[]{}|;':\",./<>?" },
      ];

      const result = composeHeaders(sources);

      expect(result["x-special"]).toBe("value!@#$%^&*()_+-=[]{}|;':\",./<>?");
    });

    it("handles very long header values", () => {
      const longValue = "a".repeat(10000);
      const sources: HeadersSource[] = [{ "x-long": longValue }];

      const result = composeHeaders(sources);

      expect(result["x-long"]).toBe(longValue);
    });

    it("handles unicode in header values", () => {
      const sources: HeadersSource[] = [{ "x-unicode": "🚀 Rocket" }];

      const result = composeHeaders(sources);

      expect(result["x-unicode"]).toBe("🚀 Rocket");
    });
  });

  describe("default protected headers", () => {
    it("includes common security-sensitive headers by default", () => {
      const defaultProtected = [
        "authorization",
        "content-type",
        "content-length",
        "user-agent",
        "host",
        "cookie",
        "set-cookie",
      ];

      for (const header of defaultProtected) {
        const sources: HeadersSource[] = [
          { [header]: "value1" },
          { [header]: "value2" },
        ];

        expect(() => composeHeaders(sources)).toThrowError(
          ProtectedHeaderOverrideError
        );
      }
    });
  });
});
