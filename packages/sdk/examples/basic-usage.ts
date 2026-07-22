import { GuildPassClient } from '../src';

async function main() {
  // Initialise the client
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
    chainId: 8453, // Base
    apiKey: 'your-api-key-here',
  });

  try {
    // Fetch guild info
    const guild = await client.guilds.getGuild({ guildId: 'guild_abc' });
    console.log('Guild:', guild.name);

    // Fetch roles
    const roles = await client.roles.getRoles({ guildId: 'guild_abc' });
    console.log('Available Roles:', roles.map((r) => r.name).join(', '));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
