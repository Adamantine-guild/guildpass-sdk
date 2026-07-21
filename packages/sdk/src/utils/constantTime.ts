/**
 * Constant-time string comparison. Always iterates the full length of the
 * longer input and never early-exits, so timing does not leak how much of a
 * prefix matched. Best-effort in JS (JIT/GC add noise); relies only on
 * TextEncoder, so it works in Node, browsers, and edge/V8.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0;
    const bv = i < bBytes.length ? bBytes[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}
