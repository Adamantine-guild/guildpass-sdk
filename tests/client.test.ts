import { describe, expect, it } from "vitest";
import { parseConfiguration } from "../src/client/config.js";
import { InvalidConfigurationError } from "../src/client/configErrors.js";
import { GuildPassClient } from "../src/client/client.js";

describe("Configuration Parser", () => {
  describe("Base URL validation", () => {
    it("uses default base URL when not provided", () => {
      const config = parseConfiguration();
      expect(config.baseUrl.href).toBe("https://api.guildpass.com/");
    });

    it("accepts valid https URLs", () => {
      const config = parseConfiguration({ baseUrl: "https://example.com/api" });
      expect(config.baseUrl.href).toBe("https://example.com/api");
    });

    it("accepts valid http URLs for local development", () => {
      const config = parseConfiguration({ baseUrl: "http://localhost:8080/" });
      expect(config.baseUrl.href).toBe("http://localhost:8080/");
    });

    it("strips trailing slashes from pathnames", () => {
      const config = parseConfiguration({ baseUrl: "https://example.com/api/" });
      expect(config.baseUrl.href).toBe("https://example.com/api");
    });

    it("does not strip trailing slash from root", () => {
      const config = parseConfiguration({ baseUrl: "https://example.com/" });
      expect(config.baseUrl.href).toBe("https://example.com/");
    });

    it("removes URL fragments", () => {
      const config = parseConfiguration({ baseUrl: "https://example.com/#fragment" });
      expect(config.baseUrl.href).toBe("https://example.com/");
    });

    it("rejects unsupported protocols", () => {
      expect(() => parseConfiguration({ baseUrl: "ftp://example.com" })).toThrowError(
        InvalidConfigurationError
      );
      expect(() => parseConfiguration({ baseUrl: "ftp://example.com" })).toThrowError(
        /not allowed/
      );
    });

    it("rejects embedded credentials", () => {
      expect(() => parseConfiguration({ baseUrl: "https://user:pass@example.com" })).toThrowError(
        InvalidConfigurationError
      );
      expect(() => parseConfiguration({ baseUrl: "https://user:pass@example.com" })).toThrowError(
        /Embedded credentials/
      );
    });

    it("rejects invalid URL strings", () => {
      expect(() => parseConfiguration({ baseUrl: "not-a-url" })).toThrowError(
        InvalidConfigurationError
      );
    });
  });

  describe("Timeout validation", () => {
    it("uses default timeout when not provided", () => {
      const config = parseConfiguration();
      expect(config.timeout).toBe(30000);
    });

    it("accepts valid positive integer timeout", () => {
      const config = parseConfiguration({ timeout: 5000 });
      expect(config.timeout).toBe(5000);
    });

    it("rejects negative timeouts", () => {
      expect(() => parseConfiguration({ timeout: -1 })).toThrowError(
        InvalidConfigurationError
      );
    });

    it("rejects zero timeout", () => {
      expect(() => parseConfiguration({ timeout: 0 })).toThrowError(
        InvalidConfigurationError
      );
    });

    it("rejects non-integer timeouts", () => {
      expect(() => parseConfiguration({ timeout: 1000.5 })).toThrowError(
        InvalidConfigurationError
      );
    });

    it("rejects timeouts exceeding maximum", () => {
      expect(() => parseConfiguration({ timeout: 300001 })).toThrowError(
        InvalidConfigurationError
      );
    });
  });

  describe("Headers validation", () => {
    it("uses empty headers when not provided", () => {
      const config = parseConfiguration();
      expect(config.headers).toEqual({});
    });

    it("defensively copies caller headers", () => {
      const callerHeaders = { "x-custom": "value" };
      const config = parseConfiguration({ headers: callerHeaders });
      callerHeaders["x-custom"] = "mutated";
      expect(config.headers["x-custom"]).toBe("value");
    });

    it("normalizes header names to lowercase", () => {
      const config = parseConfiguration({ headers: { "X-Custom-Header": "Value" } });
      expect(config.headers["x-custom-header"]).toBe("Value");
    });

    it("prevents mutation of internal configuration", () => {
      const config = parseConfiguration({ headers: { "x-custom": "value" } });
      expect(() => {
        // @ts-ignore
        config.headers["x-custom"] = "mutated";
      }).toThrow();
      expect(() => {
        // @ts-ignore
        config.timeout = 100;
      }).toThrow();
    });
  });

  describe("GuildPassClient", () => {
    it("instantiates correctly with valid configuration", () => {
      const client = new GuildPassClient({
        baseUrl: "https://api.guildpass.example",
      });

      expect(client.config.baseUrl.href).toBe("https://api.guildpass.example/");
    });
  });
});
