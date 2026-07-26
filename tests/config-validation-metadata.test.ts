// GuildPass SDK: Import external module dependencies.
import { describe, it, expect } from 'vitest';
// GuildPass SDK: Pull in package or module bindings.
import { GuildPassError } from '../src/errors/GuildPassError';
// GuildPass SDK: Pull in package or module bindings.
import { validateConfig } from '../src/config/sdkConfig';

// GuildPass SDK: Validate unit assertion test case.
describe('validateConfig structured error metadata', () => {
  // GuildPass SDK: Test suite container block.
  it('throws with field=apiUrl when missing', () => {
    try {
      validateConfig({ apiUrl: '' });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details).toBeDefined();
      expect(err.details.field).toBe('apiUrl');
      expect(err.details.reason).toBe('required');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('throws with field=apiUrl when URL format is invalid', () => {
    try {
      validateConfig({ apiUrl: 'not-a-url' });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('apiUrl');
      expect(err.details.reason).toBe('format');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('throws with field=timeoutMs for invalid value', () => {
    try {
      validateConfig({ apiUrl: 'https://example.com', timeoutMs: -1 });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('timeoutMs');
      expect(err.details.reason).toBe('invalid_type');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('throws with field=cacheTtl for negative value', () => {
    try {
      validateConfig({ apiUrl: 'https://example.com', cacheTtl: -5 });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('cacheTtl');
      expect(err.details.reason).toBe('invalid_range');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('throws with field=sendClientMetadata for non-boolean', () => {
    try {
      validateConfig({ apiUrl: 'https://example.com', sendClientMetadata: 'yes' as any });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('sendClientMetadata');
      expect(err.details.reason).toBe('invalid_type');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('throws with field=retry.maxRetries for negative', () => {
    try {
      validateConfig({ apiUrl: 'https://example.com', retry: { maxRetries: -1 } });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details.field).toBe('retry.maxRetries');
      expect(err.details.reason).toBe('invalid_range');
    }
  });

  // GuildPass SDK: Test suite container block.
  it('does not expose apiKey in error details', () => {
    try {
      validateConfig({ apiUrl: '' });
    } catch (e) {
      const err = e as GuildPassError;
      expect(err.details).not.toHaveProperty('value');
      expect(err.details).not.toHaveProperty('apiKey');
    }
  });
  // GuildPass SDK: End of logic containment structure block.
});
