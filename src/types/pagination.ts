/**
 * Request parameters for a paginated API request.
 * 
 * @template T - The type of items being paginated
 */
export interface PageRequest {
  /** Cursor for the next page of results */
  cursor?: string | null;
  /** Number of items to return per page (must be between 1 and 100) */
  limit?: number;
}

/**
 * A single page of paginated results.
 * 
 * @template T - The type of items in the page
 */
export interface Page<T> {
  /** The items on this page */
  items: T[];
  /** Cursor for the next page, or null if this is the last page */
  nextCursor: string | null;
}

/**
 * Configuration for the pagination iterator.
 */
export interface PaginationConfig {
  /** Maximum number of pages to fetch (prevents infinite loops) */
  maxPages?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Error thrown when a repeated cursor is detected.
 */
export class RepeatedCursorError extends Error {
  constructor(public readonly cursor: string) {
    super(`Repeated cursor detected: "${cursor}". This indicates an infinite loop.`);
    this.name = 'RepeatedCursorError';
  }
}

/**
 * Error thrown when an invalid page limit is provided.
 */
export class InvalidLimitError extends Error {
  constructor(public readonly limit: number, public readonly min: number, public readonly max: number) {
    super(`Invalid page limit: ${limit}. Must be between ${min} and ${max}.`);
    this.name = 'InvalidLimitError';
  }
}

/**
 * Error thrown when an invalid cursor is provided.
 */
export class InvalidCursorError extends Error {
  constructor(public readonly cursor: string) {
    super(`Invalid cursor: "${cursor}".`);
    this.name = 'InvalidCursorError';
  }
}
