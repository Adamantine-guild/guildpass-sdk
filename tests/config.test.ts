import { describe, it, expect } from "vitest";
import {
  parseConfig,
  type GuildPassClientOptions,
  ConfigError,
  ConfigErrorCode,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
} from "../src/config/index.js";
import { GuildPassClient } from "../src/client/index.js";

describe("Configuration Parser", () => {
  describe("URL Validation", () => {
    it("should accept valid HTTPS URLs", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com");
    });

    it("should accept valid HTTP URLs for local development", () => {
      const options: GuildPassClientOptions = { baseUrl: "http://localhost:8080" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("http://localhost:8080");
    });

    it("should reject invalid URLs", () => {
      const options: GuildPassClientOptions = { baseUrl: "not-a-url" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_URL);
      }
    });

    it("should reject unsupported protocols", () => {
      const options: GuildPassClientOptions = { baseUrl: "ftp://example.com" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.UNSUPPORTED_PROTOCOL);
      }
    });

    it("should reject WebSocket protocol", () => {
      const options: GuildPassClientOptions = { baseUrl: "ws://example.com" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.UNSUPPORTED_PROTOCOL);
      }
    });

    it("should reject URLs with embedded credentials", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://user:pass@api.example.com" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.URL_HAS_CREDENTIALS);
      }
    });

    it("should reject URLs with username only", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://user@api.example.com" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.URL_HAS_CREDENTIALS);
      }
    });

    it("should remove URL fragments", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com#section" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com");
    });

    it("should normalize trailing slashes", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com/" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com");
    });

    it("should normalize multiple trailing slashes", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com///" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com");
    });

    it("should preserve paths without trailing slash", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com/v1" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com/v1");
    });

    it("should normalize paths with trailing slash", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com/v1/" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com/v1");
    });

    it("should handle URLs with query parameters", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com?param=value" };
      const config = parseConfig(options);
      // URL API normalizes to include / before query params
      expect(config.baseUrl).toBe("https://api.example.com/?param=value");
    });

    it("should handle URLs with port numbers", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com:8443" };
      const config = parseConfig(options);
      expect(config.baseUrl).toBe("https://api.example.com:8443");
    });
  });

  describe("Timeout Validation", () => {
    it("should use default timeout when not specified", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com" };
      const config = parseConfig(options);
      expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    });

    it("should accept valid timeout values", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: 5000 };
      const config = parseConfig(options);
      expect(config.timeoutMs).toBe(5000);
    });

    it("should reject negative timeout values", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: -1000 };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should reject zero timeout", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: 0 };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should reject NaN timeout", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: NaN };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should reject Infinity timeout", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: Infinity };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should reject timeout below minimum", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: 50 };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should accept timeout at minimum boundary", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: MIN_TIMEOUT_MS };
      const config = parseConfig(options);
      expect(config.timeoutMs).toBe(MIN_TIMEOUT_MS);
    });

    it("should reject timeout above maximum", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: MAX_TIMEOUT_MS + 1 };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });

    it("should accept timeout at maximum boundary", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: MAX_TIMEOUT_MS };
      const config = parseConfig(options);
      expect(config.timeoutMs).toBe(MAX_TIMEOUT_MS);
    });

    it("should reject non-number timeout", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: "5000" as any };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_TIMEOUT);
      }
    });
  });

  describe("Header Validation", () => {
    it("should accept empty headers", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", headers: {} };
      const config = parseConfig(options);
      expect(config.headers).toEqual({});
    });

    it("should accept undefined headers", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com" };
      const config = parseConfig(options);
      expect(config.headers).toEqual({});
    });

    it("should accept valid headers", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom-Header": "value" },
      };
      const config = parseConfig(options);
      expect(config.headers).toEqual({ "x-custom-header": "value" });
    });

    it("should normalize header names to lowercase", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer token" },
      };
      const config = parseConfig(options);
      expect(config.headers).toEqual({
        "content-type": "application/json",
        "authorization": "Bearer token",
      });
    });

    it("should reject headers with newline characters", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom": "value\nwith\nnewlines" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_VALUE);
      }
    });

    it("should reject headers with carriage return characters", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom": "value\rwith\rcarriage" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_VALUE);
      }
    });

    it("should reject headers with null bytes", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom": "value\0null" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_VALUE);
      }
    });

    it("should reject invalid header names", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "Invalid Header": "value" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_NAME);
      }
    });

    it("should reject header names with special characters", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X@Custom": "value" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_NAME);
      }
    });

    it("should reject empty header names", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "": "value" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.INVALID_HEADER_NAME);
      }
    });

    it("should defensively copy headers", () => {
      const originalHeaders = { "X-Custom": "value" };
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: originalHeaders,
      };
      const config = parseConfig(options);

      // Modify original headers
      originalHeaders["X-Custom"] = "modified";
      originalHeaders["New-Header"] = "new";

      // Config should be unchanged
      expect(config.headers).toEqual({ "x-custom": "value" });
      expect("new-header" in config.headers).toBe(false);
    });
  });

  describe("Immutability", () => {
    it("should create frozen headers object", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom": "value" },
      };
      const config = parseConfig(options);

      expect(() => {
        (config.headers as any)["new-header"] = "value";
      }).toThrow();
    });

    it("should prevent mutation of original options affecting config", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        timeoutMs: 5000,
        headers: { "X-Custom": "value" },
      };
      const config = parseConfig(options);

      // Modify original options
      options.baseUrl = "https://malicious.com";
      options.timeoutMs = 999999;
      options.headers!["X-Custom"] = "hacked";

      // Config should remain unchanged
      expect(config.baseUrl).toBe("https://api.example.com");
      expect(config.timeoutMs).toBe(5000);
      expect(config.headers).toEqual({ "x-custom": "value" });
    });

    it("should return readonly headers", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "X-Custom": "value" },
      };
      const config = parseConfig(options);

      // TypeScript should enforce readonly
      const headers: Readonly<Record<string, string>> = config.headers;
      expect(headers).toEqual({ "x-custom": "value" });
    });
  });

  describe("Integration with GuildPassClient", () => {
    it("should create client with valid configuration", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        timeoutMs: 10000,
        headers: { "X-API-Key": "test-key" },
      };
      const client = new GuildPassClient(options);

      expect(client.baseUrl).toBe("https://api.example.com");
      expect(client.timeoutMs).toBe(10000);
      expect(client.headers).toEqual({ "x-api-key": "test-key" });
    });

    it("should use defaults when options not provided", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com" };
      const client = new GuildPassClient(options);

      expect(client.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      expect(client.headers).toEqual({});
    });

    it("should throw ConfigError for invalid configuration", () => {
      const options: GuildPassClientOptions = { baseUrl: "invalid-url" };
      expect(() => new GuildPassClient(options)).toThrow(ConfigError);
    });

    it("should prevent mutation of client configuration", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        timeoutMs: 5000,
      };
      const client = new GuildPassClient(options);

      // Modify original options after client creation
      options.baseUrl = "https://malicious.com";
      options.timeoutMs = 999999;

      // Client should remain unchanged
      expect(client.baseUrl).toBe("https://api.example.com");
      expect(client.timeoutMs).toBe(5000);
    });
  });

  describe("Error Field Information", () => {
    it("should include field name in URL errors", () => {
      const options: GuildPassClientOptions = { baseUrl: "invalid-url" };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.field).toBe("baseUrl");
      }
    });

    it("should include field name in timeout errors", () => {
      const options: GuildPassClientOptions = { baseUrl: "https://api.example.com", timeoutMs: -1000 };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.field).toBe("timeoutMs");
      }
    });

    it("should include field name in header errors", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com",
        headers: { "Invalid@Name": "value" },
      };
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.field).toBe("headers");
      }
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle complete valid configuration", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "https://api.example.com/v1/",
        timeoutMs: 15000,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token123",
          "X-Request-ID": "abc-123",
        },
      };
      const config = parseConfig(options);

      expect(config.baseUrl).toBe("https://api.example.com/v1");
      expect(config.timeoutMs).toBe(15000);
      expect(config.headers).toEqual({
        "content-type": "application/json",
        "authorization": "Bearer token123",
        "x-request-id": "abc-123",
      });
    });

    it("should handle local development configuration", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "http://localhost:3000/api",
        timeoutMs: 60000,
      };
      const config = parseConfig(options);

      expect(config.baseUrl).toBe("http://localhost:3000/api");
      expect(config.timeoutMs).toBe(60000);
    });

    it("should reject configuration with multiple validation errors", () => {
      const options: GuildPassClientOptions = {
        baseUrl: "ftp://example.com",
        timeoutMs: -1000,
        headers: { "Invalid@Name": "value" },
      };

      // Should fail on first validation error (URL)
      expect(() => parseConfig(options)).toThrow(ConfigError);
      try {
        parseConfig(options);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const configError = error as ConfigError;
        expect(configError.code).toBe(ConfigErrorCode.UNSUPPORTED_PROTOCOL);
      }
    });
  });
});
