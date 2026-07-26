import type { FetchLike } from '../http/http.types';
import type { HttpTransport, TransportRequest, TransportResponse } from './transport.types';
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';

export class FetchTransport implements HttpTransport {
  // No default here: resolving `globalThis.fetch` happens lazily in
  // `execute()` instead of being captured once at construction time, so a
  // `fetch` installed or replaced (e.g. polyfilled, or swapped in tests via
  // `vi.stubGlobal`) after this transport is constructed is still picked up.
  constructor(private readonly fetchFn?: FetchLike) {
  }

  public async execute(request: TransportRequest): Promise<TransportResponse> {
    const fetchFn = this.fetchFn ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw new GuildPassConfigError('A fetch-compatible transport is required.', GuildPassErrorCode.INVALID_CONFIG);
    }

    const response = await fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    });

    return {
      status: response.status,
      ok: response.ok,
      getHeader(name: string): string | null {
        return response.headers?.get ? response.headers.get(name) : null;
      },
      getHeaders(): Record<string, string> {
        const result: Record<string, string> = {};
        if (response.headers?.forEach) {
          response.headers.forEach((value, key) => {
            result[key] = value;
          });
        } else if ((response.headers as any)?.entries) {
          for (const [key, value] of (response.headers as any).entries()) {
            result[key] = value;
          }
        }
        return result;
      },
      json<T = any>(): Promise<T> {
        return response.json();
      },
    };
  }
}
