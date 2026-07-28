export interface AuthenticationProvider {
  /**
   * Returns a map of headers to attach to outgoing requests.
   * This is called immediately before each request.
   */
  getAuthorizationHeaders(): Promise<Record<string, string>> | Record<string, string>;

  /**
   * Called when a request fails with a 401 Unauthorized status.
   * Implementations can use this hook to refresh tokens.
   * If this returns `true`, the HTTP client will retry the request.
   * If this returns `false` or throws, the original 401 error is propagated.
   */
  onUnauthorized?(): Promise<boolean>;
}
