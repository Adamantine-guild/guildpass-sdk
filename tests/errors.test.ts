import { describe, it, expect } from "vitest";
import {
  GuildPassError,
  GuildPassErrorCode,
  ConfigurationError,
  ValidationFailedError,
  TransportError,
  HttpError,
  NetworkError,
  TimeoutError,
  CancellationError,
  MalformedResponseError,
  isGuildPassError,
} from "../src/errors/index.js";

describe("GuildPassError Hierarchy", () => {
  describe("Base GuildPassError", () => {
    it("should create error with code and message", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test error");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error.code).toBe(GuildPassErrorCode.TRANSPORT_ERROR);
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("GuildPassError");
    });

    it("should support cause option", () => {
      const cause = new Error("Underlying error");
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test error", { cause });
      expect(error.cause).toBe(cause);
    });

    it("should support metadata option", () => {
      const metadata = { status: 500, requestId: "123" };
      const error = new GuildPassError(GuildPassErrorCode.HTTP_ERROR, "Test error", { metadata });
      expect(error.metadata).toEqual(metadata);
    });

    it("should provide safe JSON serialization", () => {
      const cause = new Error("Secret information");
      const metadata = { status: 500 };
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test error", {
        cause,
        metadata,
      });

      const serialized = error.toJSON();
      expect(serialized).toEqual({
        name: "GuildPassError",
        message: "Test error",
        code: GuildPassErrorCode.TRANSPORT_ERROR,
        metadata,
      });
      expect(serialized).not.toHaveProperty("cause");
    });

    it("should handle serialization without metadata", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test error");
      const serialized = error.toJSON();
      expect(serialized).toEqual({
        name: "GuildPassError",
        message: "Test error",
        code: GuildPassErrorCode.TRANSPORT_ERROR,
      });
      expect(serialized).not.toHaveProperty("metadata");
    });

    it("should maintain stack traces", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test error");
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe("string");
    });
  });

  describe("Type Guard", () => {
    it("should identify GuildPassError instances", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test");
      expect(isGuildPassError(error)).toBe(true);
    });

    it("should identify subclass instances", () => {
      const httpError = new HttpError(404, "Not found");
      expect(isGuildPassError(httpError)).toBe(true);

      const networkError = new NetworkError("Connection failed");
      expect(isGuildPassError(networkError)).toBe(true);
    });

    it("should reject non-GuildPassError instances", () => {
      expect(isGuildPassError(new Error("Plain error"))).toBe(false);
      expect(isGuildPassError(null)).toBe(false);
      expect(isGuildPassError(undefined)).toBe(false);
      expect(isGuildPassError("string")).toBe(false);
      expect(isGuildPassError({})).toBe(false);
    });
  });

  describe("ConfigurationError", () => {
    it("should create configuration error", () => {
      const error = new ConfigurationError("Invalid API key");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.code).toBe(GuildPassErrorCode.CONFIGURATION_ERROR);
      expect(error.name).toBe("ConfigurationError");
    });

    it("should support cause and metadata", () => {
      const cause = new Error("Key missing");
      const error = new ConfigurationError("Invalid API key", { cause, metadata: { field: "apiKey" } });
      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual({ field: "apiKey" });
    });
  });

  describe("ValidationFailedError", () => {
    it("should create validation error", () => {
      const error = new ValidationFailedError("Invalid email format");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(ValidationFailedError);
      expect(error.code).toBe(GuildPassErrorCode.VALIDATION_ERROR);
      expect(error.name).toBe("ValidationFailedError");
    });

    it("should support cause and metadata", () => {
      const cause = new Error("Schema validation failed");
      const error = new ValidationFailedError("Invalid email format", { cause, metadata: { field: "email" } });
      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual({ field: "email" });
    });
  });

  describe("TransportError", () => {
    it("should create transport error", () => {
      const error = new TransportError("Connection failed");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(TransportError);
      expect(error.code).toBe(GuildPassErrorCode.TRANSPORT_ERROR);
      expect(error.name).toBe("TransportError");
    });

    it("should support cause and metadata", () => {
      const cause = new Error("ECONNREFUSED");
      const error = new TransportError("Connection failed", { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe("HttpError", () => {
    it("should create HTTP error with status", () => {
      const error = new HttpError(404, "Not found");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.code).toBe(GuildPassErrorCode.HTTP_ERROR);
      expect(error.name).toBe("HttpError");
      expect(error.status).toBe(404);
    });

    it("should include status in metadata", () => {
      const error = new HttpError(500, "Server error");
      expect(error.metadata).toEqual({ status: 500 });
    });

    it("should merge additional metadata", () => {
      const error = new HttpError(401, "Unauthorized", { requestId: "123" });
      expect(error.metadata).toEqual({ status: 401, requestId: "123" });
    });

    it("should provide safe JSON serialization with status", () => {
      const error = new HttpError(404, "Not found", { requestId: "123" });
      const serialized = error.toJSON();
      expect(serialized).toEqual({
        name: "HttpError",
        message: "Not found",
        code: GuildPassErrorCode.HTTP_ERROR,
        metadata: { status: 404 },
      });
      expect(serialized.metadata).not.toHaveProperty("requestId");
    });
  });

  describe("NetworkError", () => {
    it("should create network error", () => {
      const error = new NetworkError("Connection failed");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(TransportError);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.code).toBe(GuildPassErrorCode.TRANSPORT_ERROR);
      expect(error.name).toBe("NetworkError");
    });

    it("should support cause", () => {
      const cause = new Error("ECONNREFUSED");
      const error = new NetworkError("Connection failed", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("TimeoutError", () => {
    it("should create timeout error with default message", () => {
      const error = new TimeoutError();
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.code).toBe(GuildPassErrorCode.TIMEOUT);
      expect(error.name).toBe("TimeoutError");
      expect(error.message).toBe("Request timed out");
    });

    it("should support custom message", () => {
      const error = new TimeoutError("Custom timeout message");
      expect(error.message).toBe("Custom timeout message");
    });
  });

  describe("CancellationError", () => {
    it("should create cancellation error with default message", () => {
      const error = new CancellationError();
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(CancellationError);
      expect(error.code).toBe(GuildPassErrorCode.ABORTED);
      expect(error.name).toBe("CancellationError");
      expect(error.message).toBe("Request was cancelled");
    });

    it("should support custom message", () => {
      const error = new CancellationError("Custom cancellation message");
      expect(error.message).toBe("Custom cancellation message");
    });
  });

  describe("MalformedResponseError", () => {
    it("should create malformed response error", () => {
      const error = new MalformedResponseError("Invalid JSON");
      expect(error).toBeInstanceOf(GuildPassError);
      expect(error).toBeInstanceOf(MalformedResponseError);
      expect(error.code).toBe(GuildPassErrorCode.RESPONSE_ERROR);
      expect(error.name).toBe("MalformedResponseError");
    });

    it("should support cause", () => {
      const cause = new Error("Unexpected token");
      const error = new MalformedResponseError("Invalid JSON", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("Error Code Enum", () => {
    it("should have all expected error codes", () => {
      expect(GuildPassErrorCode.CONFIGURATION_ERROR).toBe("CONFIGURATION_ERROR");
      expect(GuildPassErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
      expect(GuildPassErrorCode.TRANSPORT_ERROR).toBe("TRANSPORT_ERROR");
      expect(GuildPassErrorCode.HTTP_ERROR).toBe("HTTP_ERROR");
      expect(GuildPassErrorCode.TIMEOUT).toBe("TIMEOUT");
      expect(GuildPassErrorCode.ABORTED).toBe("ABORTED");
      expect(GuildPassErrorCode.RESPONSE_ERROR).toBe("RESPONSE_ERROR");
    });
  });

  describe("Safe Serialization Security", () => {
    it("should not leak cause information in toJSON", () => {
      const secretCause = new Error("API_KEY=secret123");
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test", {
        cause: secretCause,
      });

      const serialized = error.toJSON();
      expect(serialized).not.toHaveProperty("cause");
    });

    it("should not leak arbitrary cause properties", () => {
      const complexCause = {
        message: "Error",
        secret: "password123",
        headers: { authorization: "Bearer token" },
      };
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test", {
        cause: complexCause,
      });

      const serialized = error.toJSON();
      expect(serialized).not.toHaveProperty("cause");
    });

    it("should only expose safe metadata in toJSON", () => {
      const error = new GuildPassError(GuildPassErrorCode.HTTP_ERROR, "Test", {
        metadata: { status: 500, safeField: "value" },
      });

      const serialized = error.toJSON();
      expect(serialized.metadata).toEqual({ status: 500, safeField: "value" });
    });

    it("should not expose unsafe metadata in HttpError toJSON", () => {
      const error = new HttpError(401, "Unauthorized", {
        requestId: "123",
        secretKey: "should-not-appear",
      });

      const serialized = error.toJSON();
      expect(serialized.metadata).toEqual({ status: 401 });
      expect(serialized.metadata).not.toHaveProperty("requestId");
      expect(serialized.metadata).not.toHaveProperty("secretKey");
    });
  });

  describe("JavaScript Compatibility", () => {
    it("should work with instanceof in JavaScript", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof GuildPassError).toBe(true);
    });

    it("should have correct prototype chain", () => {
      const error = new HttpError(404, "Not found");
      expect(Object.getPrototypeOf(error)).toBe(HttpError.prototype);
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(GuildPassError.prototype);
    });

    it("should be serializable with JSON.stringify", () => {
      const error = new GuildPassError(GuildPassErrorCode.TRANSPORT_ERROR, "Test", {
        metadata: { status: 500 },
      });
      const stringified = JSON.stringify(error);
      const parsed = JSON.parse(stringified);
      
      expect(parsed).toEqual({
        name: "GuildPassError",
        message: "Test",
        code: GuildPassErrorCode.TRANSPORT_ERROR,
        metadata: { status: 500 },
      });
      expect(parsed).not.toHaveProperty("cause");
    });
  });
});
