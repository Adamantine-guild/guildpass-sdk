import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config/sdkConfig';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';

const BASE = { apiUrl: 'https://api.example.com', fetch: globalThis.fetch ?? (() => Promise.resolve(new Response())) };

describe('Partial retry configuration validation', () => {
  it('accepts { retry: { maxRetries: 2 } } with missing delay and status fields', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxRetries: 2 } })).not.toThrow();
  });

  it('accepts { retry: { baseDelayMs: 100 } } with missing retry count and max delay', () => {
    expect(() => validateConfig({ ...BASE, retry: { baseDelayMs: 100 } })).not.toThrow();
  });

  it('accepts { retry: { maxDelayMs: 5000 } } alone', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxDelayMs: 5000 } })).not.toThrow();
  });

  it('accepts a complete retry config', () => {
    expect(() =>
      validateConfig({
        ...BASE,
        retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 5000, retryableStatuses: [429, 503] },
      }),
    ).not.toThrow();
  });

  it('accepts an empty retry object (all defaults)', () => {
    expect(() => validateConfig({ ...BASE, retry: {} })).not.toThrow();
  });

  it('rejects negative maxRetries', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxRetries: -1 } })).toThrow(GuildPassError);
    try {
      validateConfig({ ...BASE, retry: { maxRetries: -1 } });
    } catch (e: unknown) {
      expect((e as GuildPassError).code).toBe(GuildPassErrorCode.INVALID_CONFIG);
    }
  });

  it('rejects non-finite maxRetries (Infinity)', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxRetries: Infinity } })).toThrow(GuildPassError);
  });

  it('rejects non-number maxRetries', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxRetries: 'two' as any } })).toThrow(GuildPassError);
  });

  it('rejects negative baseDelayMs', () => {
    expect(() => validateConfig({ ...BASE, retry: { baseDelayMs: -100 } })).toThrow(GuildPassError);
  });

  it('rejects non-finite baseDelayMs (NaN)', () => {
    expect(() => validateConfig({ ...BASE, retry: { baseDelayMs: NaN } })).toThrow(GuildPassError);
  });

  it('rejects negative maxDelayMs', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxDelayMs: -1 } })).toThrow(GuildPassError);
  });

  it('rejects maxDelayMs less than baseDelayMs when both provided', () => {
    expect(() =>
      validateConfig({ ...BASE, retry: { baseDelayMs: 500, maxDelayMs: 100 } }),
    ).toThrow(GuildPassError);
  });

  it('rejects empty retryableStatuses array when explicitly provided', () => {
    expect(() => validateConfig({ ...BASE, retry: { retryableStatuses: [] } })).toThrow(GuildPassError);
  });

  it('rejects retryableStatuses with non-number entries', () => {
    expect(() =>
      validateConfig({ ...BASE, retry: { retryableStatuses: ['429' as any] } }),
    ).toThrow(GuildPassError);
  });

  it('accepts retryableStatuses when not provided (uses defaults)', () => {
    expect(() => validateConfig({ ...BASE, retry: { maxRetries: 3 } })).not.toThrow();
  });

  it('does not throw when retry is not provided at all', () => {
    expect(() => validateConfig({ ...BASE })).not.toThrow();
  });
});