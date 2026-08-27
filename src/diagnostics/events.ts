/**
 * Default diagnostics events for the GuildPass SDK.
 * These events provide generic observability into SDK behavior.
 */

/**
 * Default diagnostics event map.
 * Applications can extend this interface with custom events if needed.
 */
export interface DiagnosticsEvents {
  /**
   * Emitted when a request starts.
   */
  "request:start": {
    requestId: string;
    method: string;
    path: string;
  };

  /**
   * Emitted when a request completes.
   */
  "request:end": {
    requestId: string;
    durationMs: number;
  };

  /**
   * Emitted when a request fails.
   */
  "request:error": {
    requestId: string;
    error: unknown;
    durationMs: number;
  };

  /**
   * Emitted when a retry is attempted.
   */
  "request:retry": {
    requestId: string;
    attempt: number;
    maxAttempts: number;
  };

  /**
   * Emitted for SDK warnings.
   */
  "sdk:warning": {
    code: string;
    message: string;
  };

  /**
   * Emitted for SDK information messages.
   */
  "sdk:info": {
    code: string;
    message: string;
  };

  /**
   * Emitted when internal state transitions.
   */
  "state:transition": {
    from: string;
    to: string;
    context?: Record<string, unknown>;
  };

  /**
   * Emitted when validation fails.
   */
  "validation:failure": {
    field: string;
    value: unknown;
    reason: string;
  };
}
