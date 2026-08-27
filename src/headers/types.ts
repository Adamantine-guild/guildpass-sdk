/**
 * Header source type - can be either a plain object or Headers instance.
 */
export type HeadersSource = Record<string, string> | Headers;

/**
 * Options for header composition.
 */
export interface HeaderCompositionOptions {
  /**
   * Set of header names that should be protected from being overridden.
   * Header names are case-insensitive.
   * @default Set of common protected headers
   */
  protectedHeaders?: Set<string>;

  /**
   * Whether to allow overriding protected headers.
   * When false, attempting to override a protected header will throw an error.
   * @default false
   */
  allowOverride?: boolean;

  /**
   * Whether to preserve the original case of header names.
   * When false, header names are normalized to lowercase.
   * @default false
   */
  preserveCase?: boolean;
}

/**
 * Error thrown when a header name is invalid.
 */
export class InvalidHeaderNameError extends Error {
  constructor(name: string, reason: string) {
    super(`Invalid header name "${name}": ${reason}`);
    this.name = "InvalidHeaderNameError";
  }
}

/**
 * Error thrown when a header value is invalid.
 */
export class InvalidHeaderValueError extends Error {
  constructor(name: string, reason: string) {
    super(`Invalid header value for "${name}": ${reason}`);
    this.name = "InvalidHeaderValueError";
  }
}

/**
 * Error thrown when attempting to override a protected header.
 */
export class ProtectedHeaderOverrideError extends Error {
  constructor(name: string) {
    super(`Cannot override protected header "${name}"`);
    this.name = "ProtectedHeaderOverrideError";
  }
}
