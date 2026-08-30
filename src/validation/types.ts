/**
 * Validation error with path information.
 * The path array represents the location of the error in the data structure.
 * For example, ['data', 'members', '2', 'id'] serializes to 'data.members[2].id'.
 */
export interface ValidationError {
  /** Human-readable error message */
  message: string;
  /** Path to the invalid field in the data structure */
  path: string[];
}

/**
 * Discriminated union for validation results.
 * Either a successful validation with parsed data, or a failure with an error.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/**
 * Core schema interface for validation.
 * All schemas implement this interface to provide a consistent parse method.
 */
export interface Schema<T> {
  /**
   * Parse and validate the input against this schema.
   *
   * @param input - The unknown input to validate
   * @param path - Current path in the data structure (for error reporting)
   * @param depth - Current recursion depth (for DoS protection)
   * @returns ValidationResult with either the parsed data or a validation error
   */
  parse(
    input: unknown,
    path?: string[],
    depth?: number
  ): ValidationResult<T>;
}

/** Maximum recursion depth to prevent DoS attacks via circular objects */
export const MAX_DEPTH = 20;
