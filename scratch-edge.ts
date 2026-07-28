import { test } from 'vitest';
test('check EdgeRuntime', () => {
  console.log('EdgeRuntime:', (globalThis as any).EdgeRuntime);
  console.log('process.versions.node:', (globalThis as any).process?.versions?.node);
});
