import { GuildPassClient } from '../src';

async function main() {
  const client = new GuildPassClient({
    apiUrl: 'https://api.guildpass.xyz',
  });

  const walletAddress = '0x1234567890123456789012345678901234567890';
  const guildId = 'guild_abc';

  try {
    const membership = await client.membership.getMembership({
      walletAddress,
      guildId,
    });

    console.log(`Membership status for ${walletAddress} in ${guildId}:`);
    console.log(`Active: ${membership.isActive ? 'Yes' : 'No'}`);
    console.log(`Roles: ${membership.roles.join(', ')}`);
    if (membership.joinedAt) {
      console.log(`Joined: ${new Date(membership.joinedAt).toLocaleDateString()}`);
    }
  } catch (error) {
    console.error('Error fetching membership:', error);
  }
}

main();
