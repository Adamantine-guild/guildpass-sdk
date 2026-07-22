/**
 * SDK version constant.
 *
 * This value is synced with package.json during the build process.
 * Consumers can override the version header at runtime via
 * `GuildPassClientConfig.clientVersion` if needed.
 *
 * @internal — do not import package.json directly; bundlers may break.
 */
export const SDK_VERSION = '0.1.0';
