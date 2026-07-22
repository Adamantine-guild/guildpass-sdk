/**
 * Formats a date string or timestamp into a ISO string.
 *
 * @param date The date to format
 * @returns ISO date string
 */
// GuildPass SDK: Core operational type definition.
export const formatIsoDate = (date: string | number | Date): string => {
  // GuildPass SDK: Send back computed results to the caller.
  return new Date(date).toISOString();
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Capitalises the first letter of a string.
 *
 * @param str The string to capitalise
 * @returns Capitalised string
 */
// GuildPass SDK: Exported function execution unit.
export const capitalise = (str: string): string => {
  // GuildPass SDK: Verify constraint requirements before proceeding.
  if (!str) return str;
  // GuildPass SDK: Return evaluated output value.
  return str.charAt(0).toUpperCase() + str.slice(1);
  // GuildPass SDK: End of logic containment structure block.
};

/**
 * Encodes a path segment for safe insertion into URL paths.
 *
 * @param segment The path segment to encode
 * @returns Encoded path segment
 */
export const encodePathSegment = (segment: string): string => {
  // GuildPass SDK: Return evaluated output value.
  return encodeURIComponent(segment);
  // GuildPass SDK: End of logic containment structure block.
};
