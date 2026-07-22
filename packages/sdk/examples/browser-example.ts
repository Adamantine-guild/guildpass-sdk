/**
 * This is a conceptual example of how to use the SDK in a browser environment.
 * In a real browser app, you would typically use a bundler like Vite or Webpack.
 */
import { GuildPassClient } from '../src';

// Example function to be called from a UI component
export async function checkAccessForConnectedWallet(walletAddress: string) {
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
    // In browser, you might not want to expose a secret API key
    // unless it's a public/restricted key.
  });

  try {
    const isMember = await client.membership.isMember({
      walletAddress,
      guildId: 'my-guild',
    });

    if (isMember) {
      console.log('User is a member, showing premium UI');
      return true;
    } else {
      console.log('User is not a member, showing join button');
      return false;
    }
  } catch (error) {
    console.error('Failed to verify membership:', error);
    return false;
  }
}
