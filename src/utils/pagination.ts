import { Page, PageRequest, PaginationConfig, RepeatedCursorError, InvalidLimitError, InvalidCursorError } from '../types/pagination.js';

/**
 * Default pagination limits
 */
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Validates a page limit value.
 * 
 * @param limit - The limit to validate
 * @returns The validated limit
 * @throws {InvalidLimitError} If the limit is out of bounds
 */
export function validateLimit(limit?: number): number {
  const validated = limit ?? DEFAULT_LIMIT;
  
  if (validated < MIN_LIMIT || validated > MAX_LIMIT) {
    throw new InvalidLimitError(validated, MIN_LIMIT, MAX_LIMIT);
  }
  
  return validated;
}

/**
 * Validates a cursor value.
 * 
 * @param cursor - The cursor to validate
 * @returns The validated cursor
 * @throws {InvalidCursorError} If the cursor is malformed
 */
export function validateCursor(cursor: string | null | undefined): string | null {
  if (cursor === undefined || cursor === null) {
    return null;
  }
  
  // Cursor must be a non-empty string
  if (typeof cursor !== 'string') {
    throw new InvalidCursorError(String(cursor));
  }
  
  // Check for control characters BEFORE trimming
  // This ensures we catch cursors that are entirely control characters
  for (let i = 0; i < cursor.length; i++) {
    const code = cursor.charCodeAt(i);
    // Control characters: 0-31 and 127 (DEL)
    if ((code >= 0 && code <= 31) || code === 127) {
      throw new InvalidCursorError(cursor);
    }
  }
  
  // Trim whitespace
  const trimmed = cursor.trim();
  
  // Empty string is treated as no cursor
  if (trimmed === '') {
    return null;
  }
  
  return trimmed;
}

/**
 * Creates a validated page request.
 * 
 * @param request - The raw page request
 * @returns A validated page request
 */
export function createPageRequest(request: PageRequest): Required<PageRequest> {
  return {
    cursor: validateCursor(request.cursor),
    limit: validateLimit(request.limit),
  };
}

/**
 * Type guard to check if an object is a Page.
 * 
 * @param obj - The object to check
 * @returns True if the object is a Page
 */
export function isPage<T>(obj: unknown): obj is Page<T> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'items' in obj &&
    Array.isArray((obj as any).items) &&
    ('nextCursor' in obj || 'next' in obj)
  );
}

/**
 * Async generator that yields items from paginated API responses.
 * 
 * @template T - The type of items being paginated
 * @param fetchPage - A function that fetches a single page
 * @param config - Configuration options
 * @returns An async iterable of items
 * 
 * @example
 * ```typescript
 * const items = paginate(
 *   async (request) => await api.listMemberships(request),
 *   { maxPages: 5 }
 * );
 * 
 * for await (const item of items) {
 *   console.log(item);
 * }
 * ```
 */
export async function* paginate<T>(
  fetchPage: (request: PageRequest) => Promise<Page<T>>,
  config: PaginationConfig = {}
): AsyncIterable<T> {
  const { maxPages = 100, signal } = config;
  
  let cursor: string | null = null;
  let pageCount = 0;
  const seenCursors = new Set<string>();
  
  while (true) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Pagination cancelled');
    }
    
    // Check max pages limit
    if (pageCount >= maxPages) {
      throw new Error(`Maximum page limit (${maxPages}) reached`);
    }
    
    // Create the page request
    const request = createPageRequest({ cursor });
    pageCount++;
    
    // Fetch the page
    const page = await fetchPage(request);
    
    // Validate the page
    if (!isPage(page)) {
      throw new Error('Invalid page response: missing items or nextCursor');
    }
    
    // Yield items from this page
    yield* page.items;
    
    // Check if we're done
    if (page.nextCursor === null) {
      break;
    }
    
    // Detect repeated cursors
    if (seenCursors.has(page.nextCursor)) {
      throw new RepeatedCursorError(page.nextCursor);
    }
    seenCursors.add(page.nextCursor);
    
    // Move to the next page
    cursor = page.nextCursor;
  }
}

/**
 * Helper to collect all items from a paginated API into an array.
 * 
 * @template T - The type of items being paginated
 * @param fetchPage - A function that fetches a single page
 * @param config - Configuration options
 * @returns A promise that resolves to an array of all items
 * 
 * @example
 * ```typescript
 * const allItems = await collectAll(
 *   async (request) => await api.listMemberships(request),
 *   { maxPages: 3 }
 * );
 * ```
 */
export async function collectAll<T>(
  fetchPage: (request: PageRequest) => Promise<Page<T>>,
  config: PaginationConfig = {}
): Promise<T[]> {
  const items: T[] = [];
  
  for await (const item of paginate(fetchPage, config)) {
    items.push(item);
  }
  
  return items;
}

/**
 * Creates a paginated API method wrapper.
 * 
 * @template T - The type of items being paginated
 * @param apiMethod - The API method that fetches a single page
 * @returns A wrapped method that provides pagination helpers
 */
export function createPaginatedApi<T>(
  apiMethod: (request: PageRequest) => Promise<Page<T>>
) {
  return {
    /**
     * Fetch a single page of results.
     */
    page: apiMethod,
    
    /**
     * Iterate over all items across pages.
     */
    all: (config?: PaginationConfig) => paginate(apiMethod, config),
    
    /**
     * Collect all items into an array.
     */
    collect: (config?: PaginationConfig) => collectAll(apiMethod, config),
  };
}
