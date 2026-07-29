# Transports

The GuildPass SDK allows you to customise how HTTP requests are executed via the Transport Abstraction. This is especially useful for environments that don't have native `fetch` (like older Node.js versions without polyfills) or when you need custom networking behaviour for testing, mocking, or specialized serverless environments.

## Default Transport

By default, the SDK uses `FetchTransport`, which relies on the global `fetch` API. If `fetch` is available in your environment (e.g. Modern browsers, Node.js 18+, React Native, Cloudflare Workers), you don't need to configure anything.

You can also pass a custom fetch-like function without building a full transport:

```typescript
import { GuildPassClient } from '@guildpass/sdk';
import customFetch from 'node-fetch';

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  fetch: customFetch,
});
```

## Custom Transports

For advanced use cases, you can implement the `HttpTransport` interface and pass it to the client configuration. This bypasses the default `FetchTransport` entirely.

### The `HttpTransport` Interface

Your custom transport must implement a single `execute` method that takes a `TransportRequest` and returns a Promise of `TransportResponse`.

```typescript
export interface TransportRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface TransportResponse {
  status: number;
  ok: boolean;
  getHeader(name: string): string | null;
  getHeaders(): Record<string, string>;
  json<T = any>(): Promise<T>;
}

export interface HttpTransport {
  execute(request: TransportRequest): Promise<TransportResponse>;
}
```

### Example: Mock Transport for Testing

Here is an example of creating a mock transport that intercepts requests and returns predefined responses:

```typescript
import { GuildPassClient, HttpTransport, TransportRequest, TransportResponse } from '@guildpass/sdk';

class MockTransport implements HttpTransport {
  public async execute(request: TransportRequest): Promise<TransportResponse> {
    if (request.url.includes('/access/check')) {
      return {
        status: 200,
        ok: true,
        getHeader: () => null,
        getHeaders: () => ({}),
        json: async () => ({ hasAccess: true })
      };
    }
    
    return {
      status: 404,
      ok: false,
      getHeader: () => null,
      getHeaders: () => ({}),
      json: async () => ({ error: 'Not Found' })
    };
  }
}

const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.xyz',
  transport: new MockTransport(),
});
```

### Example: Axios Transport

If your application standardizes on Axios, you can create a custom transport that maps SDK requests to Axios:

```typescript
import axios from 'axios';
import { HttpTransport, TransportRequest, TransportResponse } from '@guildpass/sdk';

export class AxiosTransport implements HttpTransport {
  async execute(request: TransportRequest): Promise<TransportResponse> {
    try {
      const response = await axios({
        method: request.method,
        url: request.url,
        headers: request.headers,
        data: request.body ? JSON.parse(request.body) : undefined,
        signal: request.signal,
      });

      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        getHeader: (name) => response.headers[name.toLowerCase()] ?? null,
        getHeaders: () => response.headers as Record<string, string>,
        json: async () => response.data,
      };
    } catch (error: any) {
      if (error.response) {
        return {
          status: error.response.status,
          ok: false,
          getHeader: (name) => error.response.headers[name.toLowerCase()] ?? null,
          getHeaders: () => error.response.headers,
          json: async () => error.response.data,
        };
      }
      throw error;
    }
  }
}
```
