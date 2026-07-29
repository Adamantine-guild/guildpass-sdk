# Pluggable Authentication

The GuildPass SDK supports a flexible authentication architecture via the `AuthenticationProvider` interface. By default, API key authentication is supported out of the box, but you can implement your own custom providers to support OAuth, JWTs, Sign-in with Ethereum (SIWE), or any other auth method.

## The `AuthenticationProvider` Interface

To implement a custom provider, you need to implement the `AuthenticationProvider` interface:

```typescript
import { AuthenticationProvider } from '@guildpass/sdk';

export interface AuthenticationProvider {
  /**
   * Returns a dictionary of headers to inject into each outgoing request.
   * Can be asynchronous to allow for token fetching before the request.
   */
  getAuthorizationHeaders(): Promise<Record<string, string>> | Record<string, string>;

  /**
   * Optional hook called by the HTTP client when a 401 Unauthorized response is received.
   * You can use this to refresh access tokens and return `true` to instruct the client
   * to automatically retry the failed request.
   * Return `false` to abort the retry and propagate the original 401 error.
   */
  onUnauthorized?(): Promise<boolean>;
}
```

## Example: OAuth Bearer Token Provider

This provider automatically attaches a Bearer token and refreshes it if the SDK encounters a 401 response:

```typescript
import { AuthenticationProvider, GuildPassClient } from '@guildpass/sdk';

class OAuthAuthenticationProvider implements AuthenticationProvider {
  private accessToken: string | null = null;
  private isRefreshing = false;

  constructor(private refreshToken: string) {}

  public async getAuthorizationHeaders(): Promise<Record<string, string>> {
    if (!this.accessToken) {
      await this.refresh();
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }

  public async onUnauthorized(): Promise<boolean> {
    if (this.isRefreshing) {
      // Prevent infinite loops or concurrent refresh races
      return false; 
    }
    
    try {
      this.isRefreshing = true;
      await this.refresh();
      return true; // Token refreshed successfully, retry the request
    } catch (error) {
      return false; // Refresh failed, propagate the 401
    } finally {
      this.isRefreshing = false;
    }
  }

  private async refresh(): Promise<void> {
    // Implement token fetching logic here...
    this.accessToken = await fetchNewToken(this.refreshToken);
  }
}

// Usage:
const client = new GuildPassClient({
  apiUrl: 'https://api.guildpass.com',
  authProvider: new OAuthAuthenticationProvider('my-refresh-token')
});
```

## Registering via Builder

You can also use the `GuildPassClientBuilder`:

```typescript
import { GuildPassClientBuilder } from '@guildpass/sdk';

const client = new GuildPassClientBuilder('https://api.guildpass.com')
  .withAuthProvider(new MyCustomProvider())
  .build();
```

## Backwards Compatibility

Passing `apiKey: string` to the client configuration remains fully supported. Under the hood, this will automatically use the `ApiKeyAuthenticationProvider`:

```typescript
// These two are equivalent:
const client1 = new GuildPassClient({
  apiUrl: 'https://api.guildpass.com',
  apiKey: 'gp_123'
});

const client2 = new GuildPassClient({
  apiUrl: 'https://api.guildpass.com',
  authProvider: new ApiKeyAuthenticationProvider('gp_123')
});
```
