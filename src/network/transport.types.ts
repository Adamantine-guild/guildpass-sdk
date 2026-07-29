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
