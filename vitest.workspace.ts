import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'node',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: ['tests/compat/**'],
    },
  },
  {
    test: {
      name: 'browser',
      environment: 'jsdom',
      include: ['tests/compat/browser/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'edge',
      environment: 'edge-runtime',
      include: ['tests/compat/edge/**/*.test.ts'],
    },
  },
]);