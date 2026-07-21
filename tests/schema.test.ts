/**
 * Unit tests for the schema micro-DSL primitives in `src/validation/schema.ts`.
 *
 * Exercises every combinator independently, then tests composition (nested
 * objects, arrays of objects, optional record fields, etc.).
 */

import { describe, it, expect } from 'vitest';
import {
  string,
  nonEmptyString,
  number,
  boolean,
  address,
  optional,
  array,
  nonEmptyArray,
  record,
  object,
  strictObject,
  type Validator,
} from '../src/validation/schema';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('string()', () => {
  const v = string();

  it('accepts a string', () => {
    expect(v('hello')).toBe(true);
  });

  it('rejects a number', () => {
    expect(v(42)).toBe(false);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(v(undefined)).toBe(false);
  });

  it('rejects an object', () => {
    expect(v({})).toBe(false);
  });

  it('accepts an empty string', () => {
    expect(v('')).toBe(true);
  });
});

describe('nonEmptyString()', () => {
  const v = nonEmptyString();

  it('accepts a non-empty string', () => {
    expect(v('hello')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(v('')).toBe(false);
  });

  it('rejects a number', () => {
    expect(v(0)).toBe(false);
  });
});

describe('number()', () => {
  const v = number();

  it('accepts an integer', () => {
    expect(v(42)).toBe(true);
  });

  it('accepts zero', () => {
    expect(v(0)).toBe(true);
  });

  it('accepts a float', () => {
    expect(v(3.14)).toBe(true);
  });

  it('rejects NaN', () => {
    expect(v(NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(v(Infinity)).toBe(false);
  });

  it('rejects a numeric string', () => {
    expect(v('42')).toBe(false);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });
});

describe('boolean()', () => {
  const v = boolean();

  it('accepts true', () => {
    expect(v(true)).toBe(true);
  });

  it('accepts false', () => {
    expect(v(false)).toBe(true);
  });

  it('rejects a string', () => {
    expect(v('true')).toBe(false);
  });

  it('rejects 1', () => {
    expect(v(1)).toBe(false);
  });
});

describe('address()', () => {
  const v = address();

  it('accepts a valid lowercase address', () => {
    expect(v('0x1234567890123456789012345678901234567890')).toBe(true);
  });

  it('accepts a valid mixed-case address', () => {
    expect(v('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);
  });

  it('rejects a short address', () => {
    expect(v('0x1234')).toBe(false);
  });

  it('rejects a non-hex address', () => {
    expect(v('0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
  });

  it('rejects missing 0x prefix', () => {
    expect(v('1234567890123456789012345678901234567890')).toBe(false);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

describe('optional()', () => {
  const v = optional(string());

  it('accepts undefined', () => {
    expect(v(undefined)).toBe(true);
  });

  it('accepts a string', () => {
    expect(v('hello')).toBe(true);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });

  it('rejects a number', () => {
    expect(v(42)).toBe(false);
  });
});

describe('array()', () => {
  const v = array(string());

  it('accepts an array of strings', () => {
    expect(v(['a', 'b', 'c'])).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(v([])).toBe(true);
  });

  it('rejects an array with a non-string', () => {
    expect(v(['a', 42])).toBe(false);
  });

  it('rejects a non-array', () => {
    expect(v('not array')).toBe(false);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });
});

describe('nonEmptyArray()', () => {
  const v = nonEmptyArray(string());

  it('accepts a non-empty array of strings', () => {
    expect(v(['a'])).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(v([])).toBe(false);
  });

  it('rejects an array with a non-string', () => {
    expect(v(['a', 42])).toBe(false);
  });
});

describe('record()', () => {
  const v = record(string());

  it('accepts a Record<string, string>', () => {
    expect(v({ a: '1', b: '2' })).toBe(true);
  });

  it('accepts an empty record', () => {
    expect(v({})).toBe(true);
  });

  it('rejects a record with non-string values', () => {
    expect(v({ a: 42 })).toBe(false);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });

  it('rejects an array', () => {
    expect(v(['a', 'b'])).toBe(false);
  });
});

describe('record() with nested validator', () => {
  const v = record(array(string()));

  it('accepts Record<string, string[]>', () => {
    expect(v({ a: ['x', 'y'], b: ['z'] })).toBe(true);
  });

  it('rejects when inner value is wrong', () => {
    expect(v({ a: 'not-array' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Object validator
// ---------------------------------------------------------------------------

describe('object()', () => {
  const v = object({
    name: string(),
    age: number(),
  });

  it('accepts a valid object', () => {
    expect(v({ name: 'Alice', age: 30 })).toBe(true);
  });

  it('rejects when a field is missing', () => {
    expect(v({ name: 'Alice' })).toBe(false);
  });

  it('rejects when a field has wrong type', () => {
    expect(v({ name: 'Alice', age: 'thirty' })).toBe(false);
  });

  it('ignores extra fields (permissive)', () => {
    expect(v({ name: 'Alice', age: 30, extra: true })).toBe(true);
  });

  it('rejects null', () => {
    expect(v(null)).toBe(false);
  });

  it('rejects an array', () => {
    expect(v(['a', 'b'])).toBe(false);
  });

  it('rejects undefined', () => {
    expect(v(undefined)).toBe(false);
  });
});

describe('object() with optional fields', () => {
  const v = object({
    id: string(),
    label: optional(string()),
  });

  it('accepts an object with only required fields', () => {
    expect(v({ id: 'abc' })).toBe(true);
  });

  it('accepts an object with optional field present', () => {
    expect(v({ id: 'abc', label: 'hello' })).toBe(true);
  });

  it('accepts an object with optional field as undefined', () => {
    expect(v({ id: 'abc', label: undefined })).toBe(true);
  });
});

describe('object() with nested objects', () => {
  const v = object({
    user: object({
      name: nonEmptyString(),
      roles: array(string()),
    }),
    active: boolean(),
  });

  it('accepts a valid nested object', () => {
    expect(v({ user: { name: 'Alice', roles: ['admin'] }, active: true })).toBe(true);
  });

  it('rejects when nested field is wrong', () => {
    expect(v({ user: { name: '', roles: [] }, active: true })).toBe(false);
  });

  it('rejects when nested field is missing', () => {
    expect(v({ user: { name: 'Alice' }, active: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// strictObject()
// ---------------------------------------------------------------------------

describe('strictObject()', () => {
  const v = strictObject({
    a: string(),
    b: number(),
  });

  it('accepts an exact match', () => {
    expect(v({ a: 'x', b: 1 })).toBe(true);
  });

  it('rejects extra fields', () => {
    expect(v({ a: 'x', b: 1, c: true })).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(v({ a: 'x' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Composition: real-world shapes
// ---------------------------------------------------------------------------

describe('composition — API response shapes', () => {
  const AccessCheckResultSchema = object({
    hasAccess: boolean(),
    walletAddress: address(),
    guildId: nonEmptyString(),
    resourceId: nonEmptyString(),
    requiredRoles: nonEmptyArray(nonEmptyString()),
    matchedRoles: nonEmptyArray(nonEmptyString()),
    reason: optional(string()),
  });

  it('validates a full AccessCheckResult', () => {
    const data = {
      hasAccess: true,
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      guildId: 'guild_1',
      resourceId: 'resource_abc',
      requiredRoles: ['admin'],
      matchedRoles: ['admin'],
    };
    expect(AccessCheckResultSchema(data)).toBe(true);
  });

  it('rejects when a nested array has empty strings', () => {
    const data = {
      hasAccess: true,
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      guildId: 'guild_1',
      resourceId: 'resource_abc',
      requiredRoles: [''],
      matchedRoles: ['admin'],
    };
    expect(AccessCheckResultSchema(data)).toBe(false);
  });

  it('validates a GuildConfig with socialLinks', () => {
    const GuildConfigSchema = object({
      id: string(),
      theme: optional(string()),
      logoUrl: optional(string()),
      bannerUrl: optional(string()),
      socialLinks: optional(record(string())),
    });

    const data = {
      id: 'guild_1',
      socialLinks: { twitter: 'https://twitter.com/guild', discord: 'https://discord.gg/guild' },
    };
    expect(GuildConfigSchema(data)).toBe(true);
  });

  it('rejects GuildConfig with non-string socialLinks values', () => {
    const GuildConfigSchema = object({
      id: string(),
      theme: optional(string()),
      logoUrl: optional(string()),
      bannerUrl: optional(string()),
      socialLinks: optional(record(string())),
    });

    const data = {
      id: 'guild_1',
      socialLinks: { twitter: 42 },
    };
    expect(GuildConfigSchema(data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('empty shape object validates any object', () => {
    const v = object({});
    expect(v({})).toBe(true);
    expect(v({ a: 1, b: 2 })).toBe(true);
    expect(v(null)).toBe(false);
  });

  it('deeply nested arrays of objects', () => {
    const v = object({
      items: array(
        object({
          id: nonEmptyString(),
          tags: array(string()),
        }),
      ),
    });

    expect(v({ items: [{ id: 'a', tags: ['x'] }, { id: 'b', tags: [] }] })).toBe(true);
    expect(v({ items: [{ id: '', tags: ['x'] }] })).toBe(false);
    expect(v({ items: [{ id: 'a', tags: [42] }] })).toBe(false);
  });

  it('record with object validator', () => {
    const v = record(
      object({
        name: nonEmptyString(),
        count: number(),
      }),
    );

    expect(v({ a: { name: 'Alice', count: 1 }, b: { name: 'Bob', count: 2 } })).toBe(true);
    expect(v({ a: { name: '', count: 1 } })).toBe(false);
    expect(v({ a: { name: 'Alice' } })).toBe(false);
  });
});
