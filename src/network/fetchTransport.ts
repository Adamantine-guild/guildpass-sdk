import type { FetchLike } from '../http/http.types';
import type { HttpTransport, TransportRequest, TransportResponse } from './transport.types';
import { GuildPassConfigError } from '../errors/errorTypes';
import { GuildPassErrorCode } from '../errors/errorCodes';

export class FetchTransport implements HttpTransport {
  constructor(private readonly fetchFn: FetchLike = globalThis.fetch) {
  }

  public async execute(request: TransportRequest): Promise<TransportResponse> {
    if (typeof this.fetchFn !== 'function') {
      throw new GuildPassConfigError('A fetch-compatible transport is required.', GuildPassErrorCode.INVALID_CONFIG);
    }

    const response = await this.fetchFn(request.url, {
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
        } else if (response.headers?.entries) {
          for (const [key, value] of response.headers.entries()) {
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
