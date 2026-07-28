Difficulty: Intermediate
Type: Feature

Background: src/contracts/contractClient.ts exports formatUnits(value, decimals) for converting raw token balances to human-readable decimal strings, but there's no inverse function for converting a human-entered amount back into base units (needed for building UIs that accept e.g. "1.5" and need the raw uint256 string).

Problem: Consumers building forms (e.g. "minimum token amount" inputs for role requirements) must hand-roll decimal-shift arithmetic themselves, risking precision bugs with BigInt.

Expected outcome: An exported parseUnits(value: string, decimals: number): string that performs the exact inverse of formatUnits, returning the raw base-unit integer as a decimal string.

Suggested implementation: Implement using string manipulation (no floating point), validating the input against /^\d+(\.\d+)?$/, splitting on ., right-padding/truncating the fractional part to decimals digits, and concatenating into a single integer string. Reject inputs with more fractional digits than decimals unless explicitly rounding is requested (throw INVALID_INPUT otherwise).

Acceptance criteria:

parseUnits(formatUnits(raw, d), d) === raw for a range of round-trip test cases.
Throws GuildPassError(INVALID_INPUT) for malformed input or excess precision.
Exported from src/index.ts alongside formatUnits.
Likely affected files: src/contracts/contractClient.ts, tests/contracts-formatted-balance.test.ts.