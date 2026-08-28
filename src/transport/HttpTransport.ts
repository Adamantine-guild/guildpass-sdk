import { TransportConfig, TransportRequest } from "./types.js";
import {
  CancellationError,
  HttpError,
  MalformedResponseError,
  NetworkError,
  TimeoutError,
} from "../errors/index.js";

export class HttpTransport {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs?: number;

  constructor(config: TransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.defaultTimeoutMs = config.defaultTimeoutMs;
  }

  public async request<T = unknown>(req: TransportRequest): Promise<T> {
    const url = new URL(
      req.path.startsWith("/") ? req.path : `/${req.path}`,
      this.baseUrl
    ).toString();

    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        controller.abort(new TimeoutError());
      }, timeoutMs);
    }

    const abortHandler = () => {
      controller.abort(new CancellationError());
    };

    if (req.signal) {
      if (req.signal.aborted) {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        throw new CancellationError();
      }
      req.signal.addEventListener("abort", abortHandler);
    }

    const headers = new Headers(req.headers);
    let body: string | undefined;

    if (req.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(req.body);
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError || error instanceof CancellationError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        if (controller.signal.reason instanceof Error) {
          throw controller.signal.reason;
        }
        throw new CancellationError();
      }
      throw new NetworkError(
        error instanceof Error ? error.message : "Unknown network error",
        error instanceof Error ? error : undefined
      );
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (req.signal) {
        req.signal.removeEventListener("abort", abortHandler);
      }
    }

    if (!response.ok) {
      let metadata: unknown;
      try {
        const text = await response.text();
        if (text) {
          metadata = JSON.parse(text);
        } else {
          metadata = undefined;
        }
      } catch (e) {
        metadata = undefined;
      }
      throw new HttpError(response.status, `HTTP Error ${response.status}`, metadata);
    }

    if (response.status === 204) {
      return undefined as any;
    }

    const text = await response.text();
    if (!text) {
      return undefined as any;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new MalformedResponseError(
        "Failed to parse JSON response",
        error instanceof Error ? error : undefined
      );
    }
  }
}
