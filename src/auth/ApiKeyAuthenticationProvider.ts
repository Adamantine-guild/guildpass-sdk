import type { AuthenticationProvider } from './AuthenticationProvider';

export class ApiKeyAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly apiKey: string) {}

  public getAuthorizationHeaders(): Record<string, string> {
    return { 'X-API-Key': this.apiKey };
  }
}
