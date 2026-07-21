export type PaginatedResult<T> = {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
};

/**
 * An async generator that automatically fetches all pages of a paginated endpoint.
 *
 * @example
 * ```typescript
 * const fetchPage = (cursor?: string) => client.roles.getRoles({ guildId: '123', cursor });
 * for await (const role of paginateAll(fetchPage)) {
 *   console.log(role.name);
 * }
 * ```
 */
export async function* paginateAll<T>(
  fetchPage: (cursor?: string) => Promise<PaginatedResult<T>>
): AsyncGenerator<T, void, unknown> {
  let currentCursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchPage(currentCursor);
    for (const item of page.items) {
      yield item;
    }
    hasMore = page.hasMore;
    currentCursor = page.nextCursor;
  }
}
