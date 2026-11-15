import { HttpTransport } from "../transport/HttpTransport.js";
import type { ActivityEvent, ActivityEventType } from "../types/domain.js";
import type { Page, PageRequest } from "../types/pagination.js";
import { validateCursor, validateLimit } from "../utils/pagination.js";
import { serializeQuery } from "../utils/querySerializer.js";

/**
 * Filter and pagination options for querying GuildPass Activity events.
 */
export interface ActivityListOptions extends PageRequest {
  /** Filter events by Guild identifier */
  guildId?: string;
  /** Filter events by canonical or custom event type */
  type?: ActivityEventType | string;
  /** Filter events by subject/actor Stellar account */
  account?: string;
  /** ISO-8601 lower-bound timestamp cursor (inclusive) */
  since?: string;
  /** ISO-8601 upper-bound timestamp cursor (inclusive) */
  until?: string;
}

/**
 * Future-compatible subscription handler for real-time Activity event streams.
 */
export type ActivitySubscriptionHandler = (event: ActivityEvent) => void | Promise<void>;

/**
 * Handle returned when registering an Activity subscription.
 */
export interface ActivitySubscription {
  unsubscribe(): void;
}

/**
 * Resource client for retrieving canonical GuildPass Activity events from GuildPass Core.
 *
 * Designed as a stateless read layer over Core with forward-compatible subscription hooks.
 */
export class ActivityResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly defaultHeaders: Readonly<Record<string, string>> = {},
  ) {}

  /**
   * Lists canonical Activity events matching the provided filters and pagination options.
   */
  public async list(options: ActivityListOptions = {}): Promise<Page<ActivityEvent>> {
    const limit = validateLimit(options.limit);
    const cursor = validateCursor(options.cursor);

    const queryParams: Record<string, string | number | undefined> = {
      limit,
      ...(cursor ? { cursor } : {}),
    };

    if (options.guildId !== undefined) {
      const trimmed = options.guildId.trim();
      if (!trimmed) {
        throw new Error("guildId filter must not be an empty string");
      }
      queryParams.guildId = trimmed;
    }

    if (options.type !== undefined) {
      const trimmed = String(options.type).trim();
      if (!trimmed) {
        throw new Error("type filter must not be an empty string");
      }
      queryParams.type = trimmed;
    }

    if (options.account !== undefined) {
      const trimmed = options.account.trim();
      if (!trimmed) {
        throw new Error("account filter must not be an empty string");
      }
      queryParams.account = trimmed;
    }

    if (options.since !== undefined) {
      queryParams.since = options.since.trim();
    }

    if (options.until !== undefined) {
      queryParams.until = options.until.trim();
    }

    const queryString = serializeQuery(queryParams);
    const path = queryString ? `/activity?${queryString}` : "/activity";

    const response = await this.transport.request<
      Page<ActivityEvent> | { items?: ActivityEvent[]; events?: ActivityEvent[]; nextCursor?: string | null }
    >({
      method: "GET",
      path,
      headers: { ...this.defaultHeaders },
    });

    const items = Array.isArray((response as any)?.items)
      ? (response as any).items
      : Array.isArray((response as any)?.events)
        ? (response as any).events
        : [];

    return {
      items: items.map((item: ActivityEvent) => this.normalizeEvent(item)),
      nextCursor: (response as any)?.nextCursor ?? null,
    };
  }

  /**
   * Retrieves a single canonical Activity event by its unique identifier.
   */
  public async get(eventId: string): Promise<ActivityEvent> {
    if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
      throw new Error("eventId is required and must be a non-empty string");
    }

    const normalizedId = encodeURIComponent(eventId.trim());
    const response = await this.transport.request<ActivityEvent | { event: ActivityEvent }>({
      method: "GET",
      path: `/activity/${normalizedId}`,
      headers: { ...this.defaultHeaders },
    });

    const raw =
      response && typeof response === "object" && "event" in response
        ? (response as { event: ActivityEvent }).event
        : (response as ActivityEvent);

    return this.normalizeEvent(raw);
  }

  private normalizeEvent(raw: ActivityEvent): ActivityEvent {
    return {
      id: String(raw.id),
      guildId: String(raw.guildId),
      type: String(raw.type),
      ...(raw.account !== undefined ? { account: String(raw.account) } : {}),
      timestamp: String(raw.timestamp),
      ...(raw.payload && typeof raw.payload === "object" ? { payload: raw.payload } : {}),
    };
  }
}
