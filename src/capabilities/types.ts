/**
 * Capability definition interface
 * Represents a capability with an identifier and version
 */
export interface CapabilityDefinition {
  id: string;
  version: string;
}

/**
 * Immutable snapshot of the capability registry
 */
export interface CapabilitySnapshot {
  readonly capabilities: ReadonlyMap<string, Readonly<CapabilityDefinition>>;
  readonly orderedIds: ReadonlyArray<string>;
}

/**
 * Registry configuration options
 */
export interface RegistryOptions {
  /**
   * Policy for handling duplicate capability definitions
   * - 'error': Reject all duplicates (default)
   * - 'ignore': Silently ignore duplicate identical definitions
   * - 'replace': Replace existing definition with new one
   */
  duplicatePolicy?: 'error' | 'ignore' | 'replace';
}
