import { describe, expect, it } from "vitest";
import { InvalidQueryValueError, serializeQuery } from "../src/utils/querySerializer.js";

describe("serializeQuery", () => {
  it("serializes scalar values with deterministic key ordering", () => {
    expect(serializeQuery({ z: true, count: 12.5, active: false, empty: "" })).toBe(
      "active=false&count=12.5&empty=&z=true",
    );
  });

  it("omits null and undefined values", () => {
    expect(serializeQuery({ after: undefined, before: null, page: 2 })).toBe("page=2");
  });

  it("uses repeated keys for arrays while preserving item order", () => {
    expect(serializeQuery({ tag: ["second", "first"], score: [3, 1, 2] })).toBe(
      "score=3&score=1&score=2&tag=second&tag=first",
    );
  });

  it("serializes Dates as UTC ISO-8601 strings", () => {
    expect(serializeQuery({ at: new Date("2026-08-26T12:34:56.789-05:00") })).toBe(
      "at=2026-08-26T17%3A34%3A56.789Z",
    );
  });

  it("encodes reserved characters once", () => {
    const serialized = serializeQuery({ redirect: "a/b?x=1&y=two words" });
    expect(serialized).toBe("redirect=a%2Fb%3Fx%3D1%26y%3Dtwo+words");
    expect(new URLSearchParams(serialized).get("redirect")).toBe("a/b?x=1&y=two words");
  });

  it("round-trips Unicode through URLSearchParams", () => {
    const serialized = serializeQuery({ memo: "café 東京" });
    expect(new URLSearchParams(serialized).get("memo")).toBe("café 東京");
  });

  it("does not mutate the caller's object or arrays", () => {
    const tags = ["b", "a"] as const;
    const input = Object.freeze({ z: "last", tags: Object.freeze(tags) });
    serializeQuery(input);
    expect(input).toEqual({ z: "last", tags: ["b", "a"] });
  });

  it("rejects non-finite numbers and invalid Dates", () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(() => serializeQuery({ value })).toThrow(InvalidQueryValueError);
    }
    expect(() => serializeQuery({ at: new Date("invalid") })).toThrow(InvalidQueryValueError);
  });

  it("canonicalizes negative zero", () => {
    expect(serializeQuery({ value: -0 })).toBe("value=0");
  });

  it("rejects unsupported array items at runtime", () => {
    const invalid = { values: ["ok", true] } as unknown as Parameters<typeof serializeQuery>[0];
    expect(() => serializeQuery(invalid)).toThrow(InvalidQueryValueError);
  });
});
