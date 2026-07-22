// Node.js example using CommonJS-like imports if needed,
// but here we use ESM as the SDK supports both.
import { GuildPassClient, GuildPassErrorCode } from '../src';

async function nodeApp() {
  console.log('Starting Node.js GuildPass integration...');

  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
    apiKey: process.env.GUILDPASS_API_KEY || 'test-key',
  });

  try {
    const config = await client.guilds.getGuildConfig({ guildId: '123' });
    console.log('App Configuration loaded:', config.id);
  } catch (error: any) {
    if (error.code === GuildPassErrorCode.UNAUTHORISED) {
      console.error('Check your API key!');
    } else {
      console.error('Unexpected error:', error.message);
    }
  }
}

nodeApp();
