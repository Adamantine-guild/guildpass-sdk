import { createHmac } from "node:crypto";

/**
 * Constant-format placeholder returned for every redacted secret.
 * Never contains any part of the original value, regardless of its length or content.
 */
export const REDACTED_DISPLAY_VALUE = "[REDACTED]";

/**
 * Length, in hex characters, of the fingerprint returned by {@link fingerprintSecret}.
 * 16 hex characters encode 8 bytes (64 bits) of the underlying HMAC-SHA256 digest -
 * short enough for log lines while remaining collision-resistant for diagnostic use.
 */
export const FINGERPRINT_HEX_LENGTH = 16;

/**
 * Thrown when a secret or namespace fails validation. Messages describe the
 * violated rule only and never include the raw secret value.
 */
export class InvalidSecretError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSecretError";
  }
}

/** Options accepted by {@link redactSecret} and {@link fingerprintSecret}. */
export interface SecretRedactionOptions {
  /**
   * Explicit domain-separation namespace for this secret, e.g. `"api-key"` or
   * `"webhook-secret"`. Used as the HMAC key so identical secret values produce
   * unrelated fingerprints under different namespaces.
   */
  namespace: string;

  /**
   * When true, an empty-string secret is accepted instead of rejected.
   * @default false
   */
  allowEmpty?: boolean;
}

/** Result of {@link redactSecret}. */
export interface RedactedSecret {
  /** Constant-format placeholder; never contains any part of the original secret. */
  display: string;

  /**
   * Deterministic, non-reversible fingerprint scoped to `namespace`.
   * Lowercase hex, exactly {@link FINGERPRINT_HEX_LENGTH} characters.
   */
  fingerprint: string;

  /** The namespace used to derive `fingerprint`, echoed back for convenience. */
  namespace: string;
}

function assertValidInput(secret: string, namespace: string, allowEmpty: boolean): void {
  if (typeof secret !== "string") {
    throw new InvalidSecretError("Secret must be a string");
  }

  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new InvalidSecretError("Namespace must be a non-empty string");
  }

  if (secret.length === 0 && !allowEmpty) {
    throw new InvalidSecretError(
      "Secret must not be empty (pass allowEmpty: true to permit empty-secret fingerprints)",
    );
  }
}

/**
 * Generates a deterministic, non-reversible fingerprint for `secret`, scoped to
 * `options.namespace` via HMAC-SHA256 domain separation (the namespace is used as
 * the HMAC key, the secret as the message). Both inputs are encoded as UTF-8.
 *
 * The same secret under different namespaces yields unrelated fingerprints, so a
 * leaked fingerprint cannot be correlated across secret categories. The digest is
 * truncated to {@link FINGERPRINT_HEX_LENGTH} hex characters, which is sufficient
 * to distinguish configurations in diagnostics without being a usable secret
 * derivative.
 *
 * @throws {InvalidSecretError} If `secret` is not a string, `namespace` is not a
 * non-empty string, or `secret` is empty and `options.allowEmpty` is not `true`.
 */
export function fingerprintSecret(secret: string, options: SecretRedactionOptions): string {
  const allowEmpty = options.allowEmpty ?? false;
  assertValidInput(secret, options.namespace, allowEmpty);

  const hmac = createHmac("sha256", Buffer.from(options.namespace, "utf8"));
  hmac.update(Buffer.from(secret, "utf8"));
  return hmac.digest("hex").slice(0, FINGERPRINT_HEX_LENGTH);
}

/**
 * Produces a safe diagnostic representation of `secret`: a constant redacted
 * display value plus a namespaced fingerprint for correlating configurations
 * without exposing the original value. See {@link fingerprintSecret} for the
 * fingerprint derivation.
 *
 * @throws {InvalidSecretError} Same rules as {@link fingerprintSecret}.
 */
export function redactSecret(secret: string, options: SecretRedactionOptions): RedactedSecret {
  const fingerprint = fingerprintSecret(secret, options);
  return {
    display: REDACTED_DISPLAY_VALUE,
    fingerprint,
    namespace: options.namespace,
  };
}
