export type SupportedBodyValue =
  string | number | boolean | null | SupportedBodyValue[] | { [key: string]: SupportedBodyValue };

export interface RequestFingerprintInput {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: SupportedBodyValue;
}

export async function buildFingerprint(
  input: RequestFingerprintInput,
  excludeHeaders: string[] = [],
): Promise<string> {
  const normalizedMethod = input.method.toUpperCase();
  const normalizedPath = normalizePath(input.path);
  const normalizedQuery = normalizeQuery(input.query);
  const normalizedHeaders = normalizeHeaders(input.headers, excludeHeaders);
  const normalizedBody = normalizeBody(input.body);

  const payload = JSON.stringify({
    method: normalizedMethod,
    path: normalizedPath,
    query: normalizedQuery,
    headers: normalizedHeaders,
    body: normalizedBody,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePath(path: string): string {
  let p = path.trim();
  p = p.replace(/\/+$/, "");
  return p || "/";
}

function normalizeQuery(query?: Record<string, unknown>): Record<string, string> | undefined {
  if (!query) return undefined;

  const keys = Object.keys(query).sort();
  const result: Record<string, string> = {};
  let hasKeys = false;

  for (const key of keys) {
    const val = query[key];
    if (val !== undefined) {
      result[key] = String(val);
      hasKeys = true;
    }
  }

  return hasKeys ? result : undefined;
}

function normalizeHeaders(
  headers?: Record<string, string>,
  exclude: string[] = [],
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const excludeSet = new Set(exclude.map((h) => h.toLowerCase()));

  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .filter(([k]) => !excludeSet.has(k))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) return undefined;

  const result: Record<string, string> = {};
  for (const [k, v] of entries) {
    result[k] = v;
  }

  return result;
}

function normalizeBody(body: unknown): unknown {
  if (body === undefined) return undefined;

  return serializeDeterministic(body);
}

function serializeDeterministic(val: unknown): unknown {
  if (val === null) return null;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(serializeDeterministic);
  }

  if (typeof val === "object") {
    const keys = Object.keys(val).sort();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined) {
        result[key] = serializeDeterministic(v);
      }
    }
    return result;
  }

  throw new Error(`Unsupported body value type: ${typeof val}`);
}
