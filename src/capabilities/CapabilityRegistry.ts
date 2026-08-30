import type {
  CapabilityDefinition,
  CapabilitySnapshot,
  RegistryOptions,
} from "./types.js";
import {
  InvalidCapabilityIdentifierError,
  InvalidCapabilityVersionError,
  DuplicateCapabilityError,
} from "./errors.js";
import { isValidVersion, compareVersions } from "./versionUtils.js";

/**
 * Capability identifier validation regex
 * Format: lowercase alphanumeric words separated by dots (e.g., "membership.read", "access.check")
 */
const CAPABILITY_ID_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;

/**
 * Runtime capability registry for managing SDK capabilities
 * 
 * Features:
 * - Validates capability identifier syntax
 * - Rejects duplicate registrations with conflicting versions
 * - Provides deterministic capability checks
 * - Maintains stable ordering for capability listing
 * - Supports immutable snapshot creation
 * - Protects against caller input mutation
 */
export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private orderedIds: string[] = [];
  private options: Required<RegistryOptions>;

  constructor(options: RegistryOptions = {}) {
    this.options = {
      duplicatePolicy: options.duplicatePolicy ?? 'error',
    };
  }

  /**
   * Validate a capability identifier
   * @param id - Capability identifier to validate
   * @throws InvalidCapabilityIdentifierError if identifier is invalid
   */
  private validateIdentifier(id: string): void {
    if (typeof id !== 'string' || id.length === 0) {
      throw new InvalidCapabilityIdentifierError(id, 'Identifier must be a non-empty string');
    }

    if (!CAPABILITY_ID_REGEX.test(id)) {
      throw new InvalidCapabilityIdentifierError(
        id,
        'Identifier must match format: lowercase alphanumeric words separated by dots (e.g., "membership.read")'
      );
    }
  }

  /**
   * Validate a capability version
   * @param version - Version string to validate
   * @throws InvalidCapabilityVersionError if version is invalid
   */
  private validateVersion(version: string): void {
    if (typeof version !== 'string' || version.length === 0) {
      throw new InvalidCapabilityVersionError(version, 'Version must be a non-empty string');
    }

    if (!isValidVersion(version)) {
      throw new InvalidCapabilityVersionError(
        version,
        'Version must be a valid semantic version (e.g., "1.0.0", "2.1.3-alpha")'
      );
    }
  }

  /**
   * Deep clone a capability definition to prevent caller mutation
   * @param definition - Definition to clone
   * @returns Cloned definition
   */
  private cloneDefinition(definition: CapabilityDefinition): CapabilityDefinition {
    return {
      id: definition.id,
      version: definition.version,
    };
  }

  /**
   * Register a capability definition
   * @param definition - Capability definition to register
   * @throws InvalidCapabilityIdentifierError if identifier is invalid
   * @throws InvalidCapabilityVersionError if version is invalid
   * @throws DuplicateCapabilityError if duplicate with conflicting version
   */
  register(definition: CapabilityDefinition): void {
    // Clone input to prevent caller mutation
    const cloned = this.cloneDefinition(definition);

    // Validate identifier
    this.validateIdentifier(cloned.id);

    // Validate version
    this.validateVersion(cloned.version);

    // Check for duplicates
    const existing = this.capabilities.get(cloned.id);
    if (existing) {
      if (existing.version === cloned.version) {
        // Identical duplicate
        if (this.options.duplicatePolicy === 'error') {
          throw new DuplicateCapabilityError(cloned.id, existing.version, cloned.version);
        }
        // 'ignore' policy: silently skip
        // 'replace' policy: replace with new (same version, no effect)
        return;
      } else {
        // Conflicting duplicate - always reject
        throw new DuplicateCapabilityError(cloned.id, existing.version, cloned.version);
      }
    }

    // Add new capability
    this.capabilities.set(cloned.id, cloned);
    
    // Maintain deterministic ordering: insert in sorted order
    const insertIndex = this.orderedIds.findIndex((id) => id > cloned.id);
    if (insertIndex === -1) {
      this.orderedIds.push(cloned.id);
    } else {
      this.orderedIds.splice(insertIndex, 0, cloned.id);
    }
  }

  /**
   * Register multiple capability definitions
   * @param definitions - Array of capability definitions to register
   * @throws Error if any registration fails
   */
  registerBatch(definitions: readonly CapabilityDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  /**
   * Check if a capability is registered
   * @param id - Capability identifier to check
   * @returns true if capability exists
   */
  hasCapability(id: string): boolean {
    return this.capabilities.has(id);
  }

  /**
   * Get the version of a registered capability
   * @param id - Capability identifier
   * @returns Version string, or undefined if capability not found
   */
  getCapabilityVersion(id: string): string | undefined {
    const capability = this.capabilities.get(id);
    return capability?.version;
  }

  /**
   * Check if a capability meets a minimum version requirement
   * @param id - Capability identifier
   * @param minimumVersion - Minimum version required
   * @returns true if capability exists and version >= minimumVersion
   */
  satisfiesMinimumVersion(id: string, minimumVersion: string): boolean {
    const capability = this.capabilities.get(id);
    if (!capability) {
      return false;
    }

    try {
      return compareVersions(capability.version, minimumVersion) >= 0;
    } catch {
      // If version comparison fails, fall back to string comparison
      return capability.version >= minimumVersion;
    }
  }

  /**
   * Get all registered capability identifiers in stable order
   * @returns Array of capability identifiers
   */
  listCapabilities(): readonly string[] {
    return [...this.orderedIds];
  }

  /**
   * Get all registered capability definitions in stable order
   * @returns Array of capability definitions
   */
  listDefinitions(): readonly CapabilityDefinition[] {
    return this.orderedIds.map((id) => this.cloneDefinition(this.capabilities.get(id)!));
  }

  /**
   * Get the total number of registered capabilities
   * @returns Count of registered capabilities
   */
  size(): number {
    return this.capabilities.size;
  }

  /**
   * Create an immutable snapshot of the current registry state
   * @returns Immutable snapshot
   */
  createSnapshot(): CapabilitySnapshot {
    const capabilities = new Map<string, Readonly<CapabilityDefinition>>();
    
    for (const [id, definition] of this.capabilities) {
      capabilities.set(id, Object.freeze({ ...definition }));
    }

    return {
      capabilities: Object.freeze(capabilities),
      orderedIds: Object.freeze([...this.orderedIds]),
    };
  }

  /**
   * Clear all registered capabilities
   */
  clear(): void {
    this.capabilities.clear();
    this.orderedIds = [];
  }

  /**
   * Create a new registry instance from a snapshot
   * @param snapshot - Snapshot to restore from
   * @returns New CapabilityRegistry instance
   */
  static fromSnapshot(snapshot: CapabilitySnapshot): CapabilityRegistry {
    const registry = new CapabilityRegistry();
    
    for (const id of snapshot.orderedIds) {
      const definition = snapshot.capabilities.get(id);
      if (definition) {
        registry.register(definition);
      }
    }

    return registry;
  }
}
