/**
 * Self-contained semantic version comparison utilities
 * Parses and compares version strings in semver format (major.minor.patch)
 */

/**
 * Parsed semantic version components
 */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Parse a semantic version string
 * @param version - Version string to parse (e.g., "1.2.3", "2.0.0-alpha")
 * @returns Parsed version components
 * @throws Error if version format is invalid
 */
export function parseVersion(version: string): ParsedVersion {
  const trimmed = version.trim();
  
  // Basic semver regex: major.minor.patch[-prerelease][+build]
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;
  const match = trimmed.match(semverRegex);
  
  if (!match) {
    throw new Error(`Invalid semantic version format: "${version}"`);
  }
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Compare two version strings
 * @param versionA - First version string
 * @param versionB - Second version string
 * @returns -1 if versionA < versionB, 0 if equal, 1 if versionA > versionB
 */
export function compareVersions(versionA: string, versionB: string): number {
  const parsedA = parseVersion(versionA);
  const parsedB = parseVersion(versionB);
  
  // Compare major version
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  
  // Compare minor version
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  
  // Compare patch version
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  
  // Compare prerelease (presence indicates pre-release, which is less than release)
  if (!parsedA.prerelease && parsedB.prerelease) {
    return 1;
  }
  if (parsedA.prerelease && !parsedB.prerelease) {
    return -1;
  }
  
  // If both have prerelease, compare lexicographically
  if (parsedA.prerelease && parsedB.prerelease) {
    const prereleaseCompare = parsedA.prerelease.localeCompare(parsedB.prerelease);
    if (prereleaseCompare !== 0) {
      return prereleaseCompare < 0 ? -1 : 1;
    }
  }
  
  // Versions are equal
  return 0;
}

/**
 * Check if version A is greater than or equal to version B
 * @param versionA - Version to check
 * @param versionB - Minimum version required
 * @returns true if versionA >= versionB
 */
export function satisfiesMinimumVersion(versionA: string, versionB: string): boolean {
  return compareVersions(versionA, versionB) >= 0;
}

/**
 * Validate if a string is a valid semantic version
 * @param version - Version string to validate
 * @returns true if valid semver format
 */
export function isValidVersion(version: string): boolean {
  try {
    parseVersion(version);
    return true;
  } catch {
    return false;
  }
}
