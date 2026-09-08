# Runtime Validation System

The GuildPass SDK includes a lightweight, framework-independent runtime validation system for verifying unknown data from remote APIs before exposing it as typed public data.

## Overview

TypeScript types disappear at runtime. This validation system ensures that data received from external sources matches expected schemas, preventing malformed or incompatible responses from propagating through applications.

## Core Concepts

### Schema Interface

All validators implement the `Schema<T>` interface:

```typescript
interface Schema<T> {
  parse(input: unknown, path?: string[], depth?: number): ValidationResult<T>;
}
```

### Validation Result

Validation returns a discriminated union:

```typescript
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };
```

### Error Reporting

Validation errors include machine-readable path information:

```typescript
interface ValidationError {
  message: string;
  path: string[]; // e.g., ['data', 'members', '[2]', 'id']
}
```

## Available Schemas

### Primitives

- `string()` - Validates strings
- `number()` - Validates finite numbers (rejects NaN, Infinity)
- `boolean()` - Validates booleans
- `nullType()` - Validates null values

### Composite Types

- `literal(value)` - Validates exact literal values (string, number, boolean)
- `optional(schema)` - Allows undefined/null or validates against schema
- `nullable(schema)` - Allows null or validates against schema (rejects undefined)
- `array(itemSchema)` - Validates arrays where each item matches itemSchema
- `object(shape, options)` - Validates objects with explicitly declared keys
- `record(valueSchema)` - Validates dictionary-like objects with uniform value types
- `union(...schemas)` - Tries each schema sequentially until one succeeds

### Object Configuration

The `object` schema supports configurable unknown key handling:

```typescript
enum UnknownKeyHandling {
  STRIP = "strip",      // Remove unknown keys (default)
  REJECT = "reject",    // Fail validation if unknown keys present
  PRESERVE = "preserve" // Keep unknown keys in result
}
```

## Usage Examples

### Basic Validation

```typescript
import { string, number, object } from '@guildpass/sdk';

const userSchema = object({
  name: string(),
  age: number(),
});

const result = userSchema.parse({ name: "John", age: 30 });
if (result.success) {
  console.log(result.data.name); // TypeScript knows this is a string
} else {
  console.error(`Validation failed at ${result.error.path.join('.')}: ${result.error.message}`);
}
```

### Nested Structures

```typescript
const responseSchema = object({
  users: array(object({
    id: string(),
    name: string(),
    age: optional(number()),
  })),
});
```

### Union Types

```typescript
const statusSchema = union(
  literal("active"),
  literal("inactive"),
  literal("pending")
);
```

### Dictionary Validation

```typescript
const metadataSchema = record(string());
const result = metadataSchema.parse({ key1: "value1", key2: "value2" });
```

### Strict Object Validation

```typescript
import { UnknownKeyHandling } from '@guildpass/sdk';

const strictSchema = object(
  { name: string() },
  { unknownKeys: UnknownKeyHandling.REJECT }
);
```

## Security Features

### Depth Limiting

All validation is bounded by `MAX_DEPTH` (20 levels) to prevent DoS attacks via deeply nested or circular data:

```typescript
import { MAX_DEPTH } from '@guildpass/sdk';
```

### Type Safety

Invalid values are never returned as successful typed data. Validation failures are guaranteed to include path information for debugging.

### No Code Execution

The validation system does not execute arbitrary code from input data. It only performs type checking and structural validation.

## Best Practices

1. **Always validate external data** - Never trust data from APIs, user input, or external sources
2. **Use specific schemas** - Prefer specific schemas over generic ones when possible
3. **Handle validation failures** - Always check `result.success` before accessing `result.data`
4. **Configure unknown keys appropriately** - Use `REJECT` for strict validation, `STRIP` for lenient validation
5. **Test validation schemas** - Unit test schemas with both valid and invalid inputs

## Integration with Transport

The validation system integrates seamlessly with the HTTP transport layer:

```typescript
import { HttpTransport } from '@guildpass/sdk';
import { object, string } from '@guildpass/sdk';

const transport = new HttpTransport({ baseUrl: 'https://api.example.com' });
const userSchema = object({ name: string() });

const response = await transport.request({ method: 'GET', path: '/user' });
const validated = userSchema.parse(response);
```

## Performance Considerations

- Validation is synchronous and fast for typical response sizes
- Depth limiting prevents performance degradation on pathological inputs
- No runtime dependencies - pure TypeScript implementation
- Small footprint suitable for SDK distribution

## Error Handling

Validation errors provide structured information:

```typescript
if (!result.success) {
  const { message, path } = result.error;
  const pathString = path.length > 0 ? path.join('.') : 'root';
  console.error(`Validation failed at ${pathString}: ${message}`);
}
```

Path format uses dot notation for objects and bracket notation for arrays:
- `user.name` - nested object field
- `users[2].id` - array element with nested field
- `[0]` - root array element
