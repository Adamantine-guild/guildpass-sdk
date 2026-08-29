export class InvalidConfigurationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Invalid configuration for '${field}': ${message}`);
    this.name = "InvalidConfigurationError";
    // Fix prototype chain for subclassing Error in TS
    Object.setPrototypeOf(this, InvalidConfigurationError.prototype);
  }
}
