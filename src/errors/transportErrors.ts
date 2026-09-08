/**
 * Machine-readable error codes for GuildPass SDK errors.
 * These codes provide stable, programmatic error classification.
 */
export enum GuildPassErrorCode {
  /** Configuration-related errors (invalid SDK setup, missing credentials, etc.) */
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  /** Validation errors (invalid input data, schema violations, etc.) */
  VALIDATION_ERROR = "VALIDATION_ERROR",
  /** Transport-layer errors (network failures, connection issues) */
  TRANSPORT_ERROR = "TRANSPORT_ERROR",
  /** HTTP errors (non-2xx responses from API) */
  HTTP_ERROR = "HTTP_ERROR",
  /** Request timeout errors */
  TIMEOUT = "TIMEOUT",
  /** Request cancellation errors (aborted by caller) */
  ABORTED = "ABORTED",
  /** Response parsing errors (malformed JSON, unexpected format) */
  RESPONSE_ERROR = "RESPONSE_ERROR",
}

/**
 * Base error class for all GuildPass SDK errors.
 * Provides machine-readable error codes, safe cause chaining, and controlled serialization.
 */
export class GuildPassError extends Error {
  /** Machine-readable error code for programmatic error handling */
  public readonly code: GuildPassErrorCode;
  /** Internal cause of the error (not exposed in serialization) */
  public readonly cause?: unknown;
  /** Additional safe metadata (e.g., HTTP status) */
  public readonly metadata?: Record<string, unknown>;

  constructor(
    code: GuildPassErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "GuildPassError";
    this.code = code;
    this.cause = options?.cause;
    this.metadata = options?.metadata;
    
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, GuildPassError.prototype);
  }

  /**
   * Safe JSON serialization that excludes sensitive cause information.
   * Only includes code, message, name, and safe metadata.
   */
  toJSON(): {
    name: string;
    message: string;
    code: GuildPassErrorCode;
    metadata?: Record<string, unknown>;
  } {
    const result: {
      name: string;
      message: string;
      code: GuildPassErrorCode;
      metadata?: Record<string, unknown>;
    } = {
      name: this.name,
      message: this.message,
      code: this.code,
    };
    
    if (this.metadata !== undefined) {
      result.metadata = this.metadata;
    }
    
    return result;
  }
}

/**
 * Type guard to check if an error is a GuildPass SDK error.
 */
export function isGuildPassError(error: unknown): error is GuildPassError {
  return error instanceof GuildPassError;
}

/**
 * Configuration-related errors (invalid SDK setup, missing credentials, etc.)
 */
export class ConfigurationError extends GuildPassError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(GuildPassErrorCode.CONFIGURATION_ERROR, message, options);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Validation errors (invalid input data, schema violations, etc.)
 */
export class ValidationFailedError extends GuildPassError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(GuildPassErrorCode.VALIDATION_ERROR, message, options);
    this.name = "ValidationFailedError";
    Object.setPrototypeOf(this, ValidationFailedError.prototype);
  }
}

/**
 * Transport-layer errors (network failures, connection issues)
 */
export class TransportError extends GuildPassError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(GuildPassErrorCode.TRANSPORT_ERROR, message, options);
    this.name = "TransportError";
    Object.setPrototypeOf(this, TransportError.prototype);
  }
}

/**
 * HTTP errors (non-2xx responses from API)
 */
export class HttpError extends GuildPassError {
  public readonly status: number;

  constructor(status: number, message: string, metadata?: unknown) {
    super(GuildPassErrorCode.HTTP_ERROR, message, {
      metadata: { status, ...(metadata && typeof metadata === 'object' ? metadata : {}) }
    });
    this.name = "HttpError";
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  toJSON(): {
    name: string;
    message: string;
    code: GuildPassErrorCode;
    metadata: { status: number };
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      metadata: { status: this.status },
    };
  }
}

/**
 * Network errors (connection failures, DNS issues, etc.)
 */
export class NetworkError extends TransportError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Request timeout errors
 */
export class TimeoutError extends GuildPassError {
  constructor(message: string = "Request timed out") {
    super(GuildPassErrorCode.TIMEOUT, message);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Request cancellation errors (aborted by caller)
 */
export class CancellationError extends GuildPassError {
  constructor(message: string = "Request was cancelled") {
    super(GuildPassErrorCode.ABORTED, message);
    this.name = "CancellationError";
    Object.setPrototypeOf(this, CancellationError.prototype);
  }
}

/**
 * Response parsing errors (malformed JSON, unexpected format)
 */
export class MalformedResponseError extends GuildPassError {
  constructor(message: string, cause?: Error) {
    super(GuildPassErrorCode.RESPONSE_ERROR, message, { cause });
    this.name = "MalformedResponseError";
    Object.setPrototypeOf(this, MalformedResponseError.prototype);
  }
}
