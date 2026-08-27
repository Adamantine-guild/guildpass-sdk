import { describe, expect, it } from "vitest";
import {
  FINGERPRINT_HEX_LENGTH,
  InvalidSecretError,
  REDACTED_DISPLAY_VALUE,
  fingerprintSecret,
  redactSecret,
} from "../src/security/secretRedaction.js";

describe("fingerprintSecret", () => {
  it("matches known HMAC-SHA256 deterministic vectors", () => {
    expect(fingerprintSecret("sk_live_abc123", { namespace: "api-key" })).toBe("177b74919ff967bb");
    expect(fingerprintSecret("sk_live_abc123", { namespace: "webhook-secret" })).toBe(
      "81887e72c309b19b",
    );
    expect(fingerprintSecret("sk_live_abc124", { namespace: "api-key" })).toBe("17cf4968c2908090");
    expect(fingerprintSecret("café 東京 🔑", { namespace: "api-key" })).toBe("5a69e99ed3abebb3");
  });

  it("is deterministic for identical secret and namespace inputs", () => {
    const first = fingerprintSecret("sk_live_abc123", { namespace: "api-key" });
    const second = fingerprintSecret("sk_live_abc123", { namespace: "api-key" });
    expect(first).toBe(second);
  });

  it("produces different fingerprints for different secrets", () => {
    const a = fingerprintSecret("sk_live_abc123", { namespace: "api-key" });
    const b = fingerprintSecret("sk_live_abc124", { namespace: "api-key" });
    expect(a).not.toBe(b);
  });

  it("produces different fingerprints for the same secret under different namespaces", () => {
    const a = fingerprintSecret("sk_live_abc123", { namespace: "api-key" });
    const b = fingerprintSecret("sk_live_abc123", { namespace: "webhook-secret" });
    expect(a).not.toBe(b);
  });

  it("returns a fixed-length lowercase hex string", () => {
    const fingerprint = fingerprintSecret("sk_live_abc123", { namespace: "api-key" });
    expect(fingerprint).toHaveLength(FINGERPRINT_HEX_LENGTH);
    expect(fingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects empty secrets by default", () => {
    expect(() => fingerprintSecret("", { namespace: "api-key" })).toThrow(InvalidSecretError);
  });

  it("allows empty secrets when explicitly opted in, matching the documented vector", () => {
    expect(fingerprintSecret("", { namespace: "api-key", allowEmpty: true })).toBe(
      "7c998a77ea7c714b",
    );
  });

  it("rejects a missing or empty namespace", () => {
    expect(() => fingerprintSecret("sk_live_abc123", { namespace: "" })).toThrow(
      InvalidSecretError,
    );
  });

  it("rejects non-string secrets", () => {
    expect(() => fingerprintSecret(123 as unknown as string, { namespace: "api-key" })).toThrow(
      InvalidSecretError,
    );
  });

  it("never leaks the raw secret in a thrown error message", () => {
    const secret = "sk_live_super_secret_value";
    try {
      fingerprintSecret(secret, { namespace: "" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }

    try {
      fingerprintSecret("", { namespace: "api-key" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toMatch(/sk_live/);
    }
  });
});

describe("redactSecret", () => {
  it("never includes any part of the original secret in the display value", () => {
    const secret = "sk_live_abc123_super_secret";
    const result = redactSecret(secret, { namespace: "api-key" });
    expect(result.display).toBe(REDACTED_DISPLAY_VALUE);
    expect(result.display).not.toContain(secret);
    expect(result.display).not.toContain(secret.slice(0, 4));
    expect(result.display).not.toContain(secret.slice(-4));
  });

  it("returns a constant-format display value regardless of secret length or content", () => {
    const short = redactSecret("a", { namespace: "api-key" });
    const long = redactSecret("a".repeat(500), { namespace: "api-key" });
    expect(short.display).toBe(REDACTED_DISPLAY_VALUE);
    expect(long.display).toBe(REDACTED_DISPLAY_VALUE);
  });

  it("echoes the namespace and includes the matching fingerprint", () => {
    const result = redactSecret("sk_live_abc123", { namespace: "api-key" });
    expect(result.namespace).toBe("api-key");
    expect(result.fingerprint).toBe(fingerprintSecret("sk_live_abc123", { namespace: "api-key" }));
  });

  it("propagates validation errors without leaking the secret", () => {
    const secret = "sk_live_top_secret";
    expect(() => redactSecret(secret, { namespace: "" })).toThrow(InvalidSecretError);
    try {
      redactSecret(secret, { namespace: "" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
