import { GuildPassError } from './GuildPassError';
import { GuildPassErrorCode } from './errorCodes';

/**
 * Thrown when the SDK itself is misconfigured — an invalid `apiUrl`, a
 * missing `fetch` transport, a malformed cache/contract-provider adapter, a
 * bad retry/rate-limit policy, a reference to an unconfigured chain, or a
 * service that requires a dependency (e.g. `ContractClient`) that was never
 * wired up.
 *
 * This is distinct from {@link GuildPassApiError}: a config error means the
 * request was never (and could never have been) sent, because the SDK could
 * not be set up correctly in the first place.
 */
export class GuildPassConfigError extends GuildPassError {
  constructor(message: string, code: GuildPassErrorCode = GuildPassErrorCode.INVALID_CONFIG, details?: any) {
    super(message, code, undefined, details);
    this.name = 'GuildPassConfigError';

    // Fix for inheritance in TypeScript when targeting ES5 or lower
    Object.setPrototypeOf(this, GuildPassConfigError.prototype);
  }
}
