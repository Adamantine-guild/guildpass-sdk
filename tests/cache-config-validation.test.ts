import { describe, it, expect, vi } from 'vitest';
import { GuildPassClient } from '../src/client/GuildPassClient';
import { GuildPassError } from '../src/errors/GuildPassError';
import { GuildPassErrorCode } from '../src/errors/errorCodes';
import { InMemoryCacheAdapter } from '../src/cache/cache.types';

describe('Cache configuration validation (#81)', () => {
  describe('cacheTtl validation', () => {
    it('rejects negative cacheTtl', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: -1,
          }),
      ).toThrow(GuildPassError);
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: -1,
          }),
      ).toThrow(/cacheTtl must be a non-negative finite number/);
    });

    it('rejects NaN cacheTtl', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: NaN,
          }),
      ).toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
    });

    it('rejects Infinity cacheTtl', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: Infinity,
          }),
      ).toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
    });

    it('rejects string cacheTtl', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: 'fast' as unknown as number,
          }),
      ).toThrow(expect.objectContaining({ code: GuildPassErrorCode.INVALID_CONFIG }));
    });

    it('accepts zero cacheTtl (no expiry)', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: 0,
          }),
      ).not.toThrow();
    });

    it('accepts positive finite cacheTtl', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cacheTtl: 60_000,
          }),
      ).not.toThrow();
    });

    it('accepts undefined cacheTtl (default)', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
          }),
      ).not.toThrow();
    });
  });

  describe('cache adapter validation', () => {
    it('rejects adapter missing get()', () => {
      const badAdapter = {
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: badAdapter as any,
          }),
      ).toThrow(/cache adapter must implement get/);
    });

    it('rejects adapter missing set()', () => {
      const badAdapter = {
        get: () => Promise.resolve(null),
        delete: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: badAdapter as any,
          }),
      ).toThrow(/cache adapter must implement set/);
    });

    it('rejects adapter missing delete()', () => {
      const badAdapter = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: badAdapter as any,
          }),
      ).toThrow(/cache adapter must implement delete/);
    });

    it('rejects adapter missing clear()', () => {
      const badAdapter = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: badAdapter as any,
          }),
      ).toThrow(/cache adapter must implement clear/);
    });

    it('rejects adapter where methods are not functions', () => {
      const badAdapter = {
        get: 'not-a-function',
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: badAdapter as any,
          }),
      ).toThrow(/cache adapter must implement get/);
    });

    it('accepts a valid InMemoryCacheAdapter', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: new InMemoryCacheAdapter(),
            cacheTtl: 30_000,
          }),
      ).not.toThrow();
    });

    it('accepts a valid custom adapter with all required methods', () => {
      const customAdapter = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        clear: () => Promise.resolve(),
        deleteByPrefix: () => Promise.resolve(),
      };
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
            cache: customAdapter,
            cacheTtl: 60_000,
          }),
      ).not.toThrow();
    });

    it('accepts config without cache (optional)', () => {
      expect(
        () =>
          new GuildPassClient({
            apiUrl: 'https://api.guildpass.xyz',
          }),
      ).not.toThrow();
    });
  });
});
