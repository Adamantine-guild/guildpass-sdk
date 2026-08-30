/**
 * Immutable request context with scoped metadata propagation.
 * 
 * This class provides a framework-independent primitive for managing request-scoped
 * metadata using a linked-list/parent-pointer approach. Each context derivation
 * creates a new node in the chain, enabling efficient shadowing and inheritance
 * without mutating parent contexts.
 * 
 * @example
 * ```ts
 * const empty = RequestContext.empty();
 * const withUser = empty.with('userId', '123');
 * const withRequest = withUser.with('requestId', 'abc');
 * 
 * console.log(withRequest.get('userId')); // '123'
 * console.log(withRequest.get('requestId')); // 'abc'
 * console.log(empty.get('userId')); // undefined (empty context unchanged)
 * ```
 */
export class RequestContext<T extends Record<string, any> = {}> {
  private constructor(
    private readonly parent?: RequestContext<any>,
    private readonly key?: string,
    private readonly value?: any
  ) {}

  /**
   * Creates an empty context with no metadata.
   * 
   * @returns A new empty RequestContext instance
   */
  static empty(): RequestContext<{}> {
    return new RequestContext();
  }

  /**
   * Derives a new context with an additional key-value pair.
   * The original context remains immutable.
   * 
   * @template K - The key type (string literal)
   * @template V - The value type
   * @param key - The key to add
   * @param value - The value to associate with the key
   * @returns A new RequestContext with the extended type
   * 
   * @example
   * ```ts
   * const ctx = RequestContext.empty();
   * const withUser = ctx.with('userId', '123');
   * // ctx is still empty, withUser has userId
   * ```
   */
  with<K extends string, V>(
    key: K,
    value: V
  ): RequestContext<T & Record<K, V>> {
    return new RequestContext(this, key, value);
  }

  /**
   * Retrieves the value for a given key by traversing the parent chain.
   * Returns undefined if the key does not exist in the context chain.
   * 
   * @template K - The key type
   * @param key - The key to retrieve
   * @returns The value associated with the key, or undefined if not found
   * 
   * @example
   * ```ts
   * const ctx = RequestContext.empty().with('userId', '123');
   * ctx.get('userId'); // '123'
   * ctx.get('nonexistent'); // undefined
   * ```
   */
  get<K extends keyof T>(key: K): T[K] {
    // Check if this node has the key
    if (this.key === key) {
      return this.value;
    }

    // Traverse up the parent chain
    if (this.parent) {
      return this.parent.get(key);
    }

    // Key not found in the chain
    return undefined as T[K];
  }

  /**
   * Checks if a key exists in the context chain.
   * Distinguishes between a missing key and a key explicitly set to undefined.
   * 
   * @param key - The key to check
   * @returns true if the key exists in the context chain, false otherwise
   * 
   * @example
   * ```ts
   * const ctx1 = RequestContext.empty().with('userId', '123');
   * ctx1.has('userId'); // true
   * 
   * const ctx2 = RequestContext.empty().with('userId', undefined);
   * ctx2.has('userId'); // true (explicitly set to undefined)
   * 
   * const ctx3 = RequestContext.empty();
   * ctx3.has('userId'); // false (key not set)
   * ```
   */
  has(key: string): boolean {
    // Check if this node has the key
    if (this.key === key) {
      return true;
    }

    // Traverse up the parent chain
    if (this.parent) {
      return this.parent.has(key);
    }

    // Key not found in the chain
    return false;
  }
}
