/**
 * Base error for capability-related errors
 */
export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityError";
    Object.setPrototypeOf(this, CapabilityError.prototype);
  }
}

/**
 * Error thrown when a capability identifier has invalid syntax
 */
export class InvalidCapabilityIdentifierError extends CapabilityError {
  public readonly identifier: string;

  constructor(identifier: string, reason: string) {
    super(`Invalid capability identifier "${identifier}": ${reason}`);
    this.name = "InvalidCapabilityIdentifierError";
    this.identifier = identifier;
    Object.setPrototypeOf(this, InvalidCapabilityIdentifierError.prototype);
  }
}

/**
 * Error thrown when a capability version has invalid format
 */
export class InvalidCapabilityVersionError extends CapabilityError {
  public readonly version: string;

  constructor(version: string, reason: string) {
    super(`Invalid capability version "${version}": ${reason}`);
    this.name = "InvalidCapabilityVersionError";
    this.version = version;
    Object.setPrototypeOf(this, InvalidCapabilityVersionError.prototype);
  }
}

/**
 * Error thrown when attempting to register a duplicate capability with conflicting version
 */
export class DuplicateCapabilityError extends CapabilityError {
  public readonly id: string;
  public readonly existingVersion: string;
  public readonly newVersion: string;

  constructor(id: string, existingVersion: string, newVersion: string) {
    super(
      `Duplicate capability "${id}" with conflicting versions: existing="${existingVersion}", new="${newVersion}"`
    );
    this.name = "DuplicateCapabilityError";
    this.id = id;
    this.existingVersion = existingVersion;
    this.newVersion = newVersion;
    Object.setPrototypeOf(this, DuplicateCapabilityError.prototype);
  }
}
